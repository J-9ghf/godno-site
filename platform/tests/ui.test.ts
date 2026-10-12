// Проверка экранов в браузере (Chromium без интерфейса): вход с 2FA, кабинеты администратора и клиента,
// изоляция данных на экранах, просмотр PDF, отзывы и решения клиента, отсутствие чатов, ошибки в консоли и CSP.
// Браузер не скачивается: используется установленный Chromium (CHROMIUM_PATH или /opt/pw-browsers).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inject } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright-core';
import { base, PASSWORD, totp, uniq, tokenOf, lastLink, Client, enable2fa } from './helpers';
import { buildWorld, type World } from './world';

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = '/opt/pw-browsers';
  if (!existsSync(root)) return null;
  for (const d of readdirSync(root).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const p = join(root, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return null;
}
const exe = findChromium();

describe.skipIf(!exe)('экраны кабинетов в браузере', () => {
  let browser: Browser;
  let w: World;
  let adminSecret = '';
  let adminEmail = '';
  const problems: string[] = [];

  async function page(viewport = { width: 1360, height: 900 }) {
    const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { 'x-real-ip': `10.9.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}` } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (403|404|409|422)/.test(m.text())) problems.push('console: ' + m.text()); });
    return p;
  }
  async function login(p: Page, email: string, secret?: string) {
    await p.goto(base() + '/login');
    await p.fill('#lg-email', email);
    await p.fill('#lg-pass', PASSWORD);
    await p.click('#loginForm button[type=submit]');
    if (secret) {
      await p.waitForSelector('#tfaForm:not([hidden])');
      await p.fill('#tf-code', totp(secret));
      await p.click('#tfaForm button[type=submit]');
    }
    await p.waitForURL(/\/app/);
    await p.waitForSelector('.app .topbar h1');
    await p.waitForFunction(() => !document.querySelector('#content[aria-busy]'));
  }
  // Текст раздела после загрузки данных (пока идёт запрос, у #content стоит aria-busy)
  // UI_SHOTS=папка — сохранить снимки экранов для ручной проверки дизайна
  const shot = async (p: Page, name: string) => { if (process.env.UI_SHOTS) await p.screenshot({ path: join(process.env.UI_SHOTS, name + '.png'), fullPage: true }); };
  const content = async (p: Page) => { await p.waitForFunction(() => !document.querySelector('#content[aria-busy]')); return p.locator('#content').innerText(); };

  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: exe!, args: ['--no-sandbox'] });
    w = await buildWorld('ui');
    // Отдельный администратор для входа через браузер (у общего из helpers уже открыта сессия в тестах API)
    adminEmail = uniq('ui-admin');
    execFileSync('npx', ['tsx', 'scripts/create-admin.ts', adminEmail], { env: { ...process.env, ...JSON.parse(inject('serverEnv')) }, stdio: 'pipe' });
    const c = new Client();
    await c.json('POST', '/api/invitations/accept', { token: tokenOf(lastLink(adminEmail, 'invite')), name: 'Админ Интерфейса', password: PASSWORD });
    adminSecret = (await enable2fa(c)).secret;
    // Ждём следующего 30-секундного окна, чтобы код при входе не совпал с кодом включения
    const left = 30_000 - (Date.now() % 30_000);
    await new Promise((r) => setTimeout(r, left + 500));
  }, 120_000);
  afterAll(async () => { await browser?.close(); });

  it('администратор входит с кодом 2FA и видит все разделы демоверсии без чатов', async () => {
    const p = await page();
    await login(p, adminEmail, adminSecret);
    expect(await p.locator('.topbar h1').innerText()).toBe('Дашборд');
    const nav = await p.locator('.snav button').allInnerTexts();
    expect(nav).toEqual(['Дашборд', 'Клиенты', 'Вакансии и кандидаты', 'Пул кандидатов', 'Пользователи и доступы', 'Журнал действий', 'Безопасность и согласия']);
    expect(nav.join(' ')).not.toMatch(/Сообщени|Чат/i);
    expect(await content(p)).toMatch(/Воронка/);
    await shot(p, 'admin-dash');

    // Клиенты → карточка клиента → вкладки
    await p.click('.snav button[data-sec=clients]');
    await p.waitForSelector(`text=${w.A.name}`);
    await p.click(`[data-act=openClient][data-id="${w.A.id}"] >> nth=0`);
    await p.waitForFunction(() => location.hash.startsWith('#client/'));
    await p.waitForSelector('.topbar h1:has-text("Карточка клиента")');
    expect(await content(p)).toContain(w.A.name);

    // Вакансия: кандидаты по вакансии, представления и этапы
    await p.goto(base() + `/app#vacancy/${w.vA.id}`);
    await p.waitForSelector('.topbar h1:has-text("Кандидаты по вакансии")');
    await p.waitForFunction(() => !document.querySelector('#content[aria-busy]'));
    const vac = await content(p);
    expect(vac).toContain(w.X.full_name);
    expect(vac).toContain(w.Z.full_name); // внутренний кандидат виден администратору
    await shot(p, 'admin-vacancy');

    // Карточка кандидата: файлы, согласия, заметки
    await p.goto(base() + `/app#candidate/${w.X.id}`);
    await p.waitForSelector('.topbar h1:has-text("Карточка кандидата")');
    await p.waitForFunction(() => !document.querySelector('#content[aria-busy]'));
    const card = await content(p);
    expect(card).toContain('resume.pdf');
    expect(card).toContain('ВНУТРЕННЯЯ-ЗАМЕТКА-ui');
    await shot(p, 'admin-candidate');

    // Пул с поиском, журнал, безопасность
    await p.click('.snav button[data-sec=pool]');
    await p.fill('#pl-q', 'Игрекова');
    await p.waitForFunction(() => !document.body.innerText.includes('Иксова Тест ui') && document.body.innerText.includes('Игрекова Тест ui'));
    await p.click('.snav button[data-sec=log]');
    await p.waitForSelector('.topbar h1:has-text("Журнал действий")');
    await p.click('.snav button[data-sec=security]');
    await p.waitForSelector('text=включена');
    expect(problems).toEqual([]);
    await p.context().close();
  });

  it('администратор без 2FA попадает только в раздел безопасности', async () => {
    const email = uniq('ui-no2fa');
    execFileSync('npx', ['tsx', 'scripts/create-admin.ts', email], { env: { ...process.env, ...JSON.parse(inject('serverEnv')) }, stdio: 'pipe' });
    const c = new Client();
    await c.json('POST', '/api/invitations/accept', { token: tokenOf(lastLink(email, 'invite')), name: 'Админ Без Кода', password: PASSWORD });
    const p = await page();
    await login(p, email);
    expect(await p.locator('.snav button').allInnerTexts()).toEqual(['Безопасность']);
    expect(await p.locator('.main').innerText()).toMatch(/включите двухфакторную аутентификацию/);
    await p.goto(base() + '/app#clients');
    await p.waitForFunction(() => !document.querySelector('#content[aria-busy]'));
    expect(await p.locator('.topbar h1').innerText()).toBe('Безопасность и согласия');
    expect(await p.locator('#tfaStart').count()).toBe(1);
    await shot(p, 'admin-no2fa');
    expect(problems).toEqual([]);
    await p.context().close();
  });

  it('клиент видит только свою компанию и представленных ей кандидатов', async () => {
    const p = await page();
    await login(p, w.a1.email);
    expect(await p.locator('.snav button').allInnerTexts()).toEqual(['Дашборд', 'Мои кандидаты', 'Вакансии', 'Профиль']);
    const dash = await p.locator('#view-app').innerText();
    expect(dash).toContain(w.A.name);
    expect(dash).not.toContain(w.B.name);

    await p.click('.snav button[data-sec=cands]');
    await p.waitForSelector('.board');
    const board = await content(p);
    expect(board).toContain(w.X.full_name);
    expect(board).toContain(w.Y.full_name);
    expect(board).not.toContain(w.Z.full_name); // Z рассматривается по вакансии A внутренне, но не представлен
    expect(board).not.toContain(w.vB.title);
    await shot(p, 'client-board');

    await p.click('.snav button[data-sec=vacancies]');
    await p.waitForSelector('.req-card');
    const vacs = await content(p);
    expect(vacs).toContain(w.vA.title);
    expect(vacs).not.toContain(w.vB.title);

    // Профиль: смена пароля есть, чатов нет
    await p.click('.snav button[data-sec=profile]');
    await p.waitForSelector('#pwForm');
    expect(await p.locator('#view-app').innerText()).not.toMatch(/Сообщени|Чат/i);
    expect(problems).toEqual([]);
    await p.context().close();
  });

  it('карточка кандидата у клиента: права, просмотр PDF, отзыв и решение без следов другого клиента', async () => {
    const p = await page();
    await login(p, w.a1.email);
    await p.goto(base() + '/app#cands');
    await p.waitForSelector('.board');
    await p.click(`.ccard[data-id="${w.pXA.id}"]`);
    await p.waitForSelector('.modal .dossier-top');
    const modal = await p.locator('.modal').innerText();
    expect(modal).toContain(`Комментарий ui`);
    expect(modal).toContain('менеджер откроет'); // контакты закрыты для компании A
    expect(modal).not.toContain('+70000000001');
    expect(modal).not.toContain('Видео-визитка'); // видео открыто только компании B
    expect(modal).not.toContain(w.B.name);
    expect(modal).not.toContain('ВНУТРЕННЯЯ-ЗАМЕТКА');
    expect(await p.locator('.modal a[download]').count()).toBe(0); // скачивание не разрешено

    // Встроенный просмотр PDF рисует страницу и ставит пометку компании
    await p.click('[data-act=viewResume]');
    await p.waitForSelector('.pdf-page canvas', { timeout: 20_000 });
    expect(await p.locator('.pdf-wm').first().innerText()).toContain(w.A.name);
    await shot(p, 'client-pdf');
    await p.keyboard.press('Escape');

    // Отзыв и решение «Интересен»
    await p.click(`.ccard[data-id="${w.pXA.id}"]`);
    await p.waitForSelector('#fbForm');
    await p.fill('#fb-body', 'Отзыв из браузерного теста');
    await p.click('#fbForm button[type=submit]');
    await p.waitForSelector('.modal >> text=Отзыв из браузерного теста');
    await p.click('[data-act=decide][data-s=interested]');
    await p.waitForSelector('.toast >> text=Решение сохранено');
    await p.waitForSelector('.modal .hist >> text=Интересен');
    await shot(p, 'client-card');
    expect(problems).toEqual([]);
    await p.context().close();

    // Администратор видит отзыв и историю; клиент B не видит отзыв компании A
    const fbB = await w.b1.client.json('GET', `/api/client/presentations/${w.pXB.id}`);
    expect(JSON.stringify(fbB)).not.toContain('Отзыв из браузерного теста');
  });

  it('наблюдатель только просматривает: кнопок решений и формы отзыва нет', async () => {
    const p = await page();
    await login(p, w.a2.email);
    await p.goto(base() + '/app#cands');
    await p.waitForSelector('.board');
    await p.click(`.ccard[data-id="${w.pYA.id}"]`);
    await p.waitForSelector('.modal .dossier-top');
    expect(await p.locator('.modal').innerText()).toContain('только для просмотра');
    expect(await p.locator('[data-act=decide], #fbForm, [data-act=rejectForm]').count()).toBe(0);
    await p.context().close();
  });

  it('мобильная ширина: меню разделов и экран без горизонтальной прокрутки', async () => {
    const p = await page({ width: 390, height: 844 });
    await login(p, w.b1.email);
    expect(await p.locator('.mob-nav').isVisible()).toBe(true);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await shot(p, 'client-mobile');
    await p.context().close();
  });

  it('после выхода кабинет недоступен', async () => {
    const p = await page();
    await login(p, w.b1.email);
    await p.click('.topbar [data-act=logout]');
    await p.waitForURL(/\/login/);
    await p.goto(base() + '/app');
    expect(p.url()).toMatch(/\/login/);
    await p.context().close();
  });
});
