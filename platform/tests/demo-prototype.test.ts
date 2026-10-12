// Демоверсия (prototypes/ikr-platform.html) после удаления чатов: каждая роль открывает все разделы меню,
// карточки и вкладки без ошибок, а следов переписки нет ни в коде, ни на экранах.
// Сервер платформы не нужен: файл открывается в Chromium напрямую. Внешние шрифты в тесте не загружаются.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright-core';

const FILE = resolve(__dirname, '../../prototypes/ikr-platform.html');
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
const CHAT = /Сообщени|Переписк|Новая тема|msgForm|threadForm|openThread|newThread|getThreads|getMessages|sendMessage|tMessages|conv-b|class="bub/;

describe('демоверсия без чатов', () => {
  it('в коде демоверсии нет переписки', () => {
    expect(readFileSync(FILE, 'utf8')).not.toMatch(CHAT);
  });

  describe.skipIf(!exe)('в браузере', () => {
    let browser: Browser;
    beforeAll(async () => { browser = await chromium.launch({ executablePath: exe!, args: ['--no-sandbox'] }); });
    afterAll(async () => { await browser?.close(); });

    for (const [user, role] of [['u_c1', 'клиент'], ['u_c2', 'клиент-семья'], ['u_m1', 'менеджер'], ['u_admin', 'администратор']] as const) {
      it(`${role}: все разделы, карточки и вкладки открываются без ошибок`, async () => {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
        await ctx.route(/^https?:\/\//, (r) => r.abort()); // без внешних запросов (шрифты)
        const p = await ctx.newPage();
        const errors: string[] = [];
        p.on('pageerror', (e) => errors.push(e.message));
        await p.goto('file://' + FILE);
        await p.evaluate(() => localStorage.clear());
        await p.reload();
        // Кнопки демо-входа на скрытом экране входа: нажимаем программно, обработчик тот же
        await p.evaluate((u) => (document.querySelector(`[data-act=demoLogin][data-user=${u}]`) as HTMLElement).click(), user);
        await p.waitForSelector('.app .snav');
        const sections = await p.locator('.snav button[data-sec]').evaluateAll((b) => b.map((x) => (x as HTMLElement).dataset.sec!));
        expect(sections.length).toBeGreaterThan(3);
        expect(sections).not.toContain('messages');
        const seen: string[] = [];
        for (const sec of sections) {
          await p.locator(`.snav button[data-sec="${sec}"]`).click();
          await p.waitForTimeout(50);
          seen.push(await p.locator('#view-app').innerText());
          // Первая карточка кандидата или клиента в разделе
          const card = p.locator('#content .ccard[data-act], #content [data-act=openClient], #content tr.click[data-act]').first();
          if (await card.count()) {
            await card.click();
            await p.waitForTimeout(50);
            seen.push(await p.locator('body').innerText());
            for (const tab of await p.locator('[data-act=clientTab]').all()) { await tab.click(); await p.waitForTimeout(30); seen.push(await p.locator('#content').innerText()); }
            await p.keyboard.press('Escape');
          }
        }
        expect(errors).toEqual([]);
        expect(seen.join('\n')).not.toMatch(/Сообщени|Переписк|Новая тема/);
        await ctx.close();
      });
    }
  });
});
