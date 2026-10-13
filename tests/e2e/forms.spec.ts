import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { resetAuthState, sql } from './helpers';

// Формы принимают отправку не раньше чем через 3 секунды после открытия страницы (защита от ботов).
const HUMAN_DELAY = 3_200;

const dir = mkdtempSync(path.join(tmpdir(), 'ikr-e2e-'));
const validPdf = path.join(dir, 'resume.pdf');
writeFileSync(validPdf, '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const fakePdf = path.join(dir, 'fake.pdf');
writeFileSync(fakePdf, '<html><script>alert(1)</script></html>');
const hugePdf = path.join(dir, 'huge.pdf');
writeFileSync(hugePdf, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024 + 10)]));

test.beforeEach(() => {
  resetAuthState();
  sql("delete from requests where source = 'site' and contact_name like 'E2E%'");
  sql("delete from candidates where full_name like 'E2E%'");
});

async function openLead(page: Page) {
  await page.goto(`/?t=${Date.now()}#contact`);
  return page.getByRole('form', { name: 'Заявка работодателя' });
}

async function openResume(page: Page) {
  await page.goto(`/?t=${Date.now()}#candidates`);
  return page.getByRole('form', { name: 'Отправить резюме' });
}

test('заявка работодателя: сохраняется в базе с источником «сайт», команда получает уведомление без контактов', async ({ page }) => {
  const form = await openLead(page);
  await form.getByLabel('Имя').fill('E2E Работодатель');
  await form.getByLabel('Телефон или Telegram').fill('+7 900 123-45-67');
  await form.getByLabel('Компания (необязательно)').fill('ООО Тест');
  await form.getByLabel('Кого ищете (необязательно)').selectOption({ label: 'Повар' });
  await form.getByLabel('Что уже пробовали и какие требования (необязательно)').fill('Искали через знакомых');
  await form.getByLabel('Ориентир по бюджету (необязательно)').fill('до 120 000 ₽');
  await form.getByLabel(/Я даю согласие на обработку персональных данных/).check();
  await page.waitForTimeout(HUMAN_DELAY);
  await form.getByRole('button', { name: 'Оставить заявку' }).click();
  await expect(page.getByText('Спасибо. Мы свяжемся с вами.')).toBeVisible();

  expect(sql("select source || '|' || status || '|' || coalesce(company_id::text, 'null') || '|' || position_code || '|' || contact_phone || '|' || (consent_at is not null) from requests where contact_name = 'E2E Работодатель'"))
    .toBe('site|new|null|cook|+7 900 123-45-67|true');
});

test('заявка без согласия и без контакта не отправляется', async ({ page }) => {
  const form = await openLead(page);
  await form.getByLabel('Имя').fill('E2E Без согласия');
  await page.waitForTimeout(HUMAN_DELAY);
  await form.getByRole('button', { name: 'Оставить заявку' }).click();
  await expect(form.getByText('Без согласия отправить нельзя')).toBeVisible();
  await expect(form.getByText('Укажите телефон или Telegram')).toBeVisible();
  expect(sql("select count(*) from requests where contact_name = 'E2E Без согласия'")).toBe('0');
});

test('бот: заполненное поле-ловушка — «успех» без записи; слишком быстрая отправка — отказ', async ({ page }) => {
  let form = await openLead(page);
  await form.getByLabel('Имя').fill('E2E Бот');
  await form.getByLabel('Телефон или Telegram').fill('+7 900 000-00-01');
  await form.getByLabel(/Я даю согласие/).check();
  await form.locator('input[name="website"]').fill('http://spam.example', { force: true });
  await page.waitForTimeout(HUMAN_DELAY);
  await form.getByRole('button', { name: 'Оставить заявку' }).click();
  await expect(page.getByText('Спасибо. Мы свяжемся с вами.')).toBeVisible();
  expect(sql("select count(*) from requests where contact_name = 'E2E Бот'")).toBe('0');

  form = await openLead(page);
  await form.getByLabel('Имя').fill('E2E Спешка');
  await form.getByLabel('Телефон или Telegram').fill('+7 900 000-00-02');
  await form.getByLabel(/Я даю согласие/).check();
  await form.getByRole('button', { name: 'Оставить заявку' }).click();
  await expect(form.getByText('Форма устарела. Обновите страницу и отправьте ещё раз.')).toBeVisible();
  expect(sql("select count(*) from requests where contact_name = 'E2E Спешка'")).toBe('0');
});

// Адрес, с которого браузер отправляет форму, определяется так же, как на сервере: за прокси (Caddy) — по
// соединению, без доверия заголовку X-Forwarded-For из браузера. Поэтому тест не угадывает адрес (127.0.0.1, ::1),
// а берёт тот, что записало приложение после первой заявки. E2E_VIA_PROXY=1 — проверить ещё и подмену заголовка.
const VIA_PROXY = process.env.E2E_VIA_PROXY === '1';
const FORGED_IP = '198.51.100.77';

async function sendLead(page: Page, name: string, phone: string) {
  const form = await openLead(page);
  await form.getByLabel('Имя').fill(name);
  await form.getByLabel('Телефон или Telegram').fill(phone);
  await form.getByLabel(/Я даю согласие/).check();
  await page.waitForTimeout(HUMAN_DELAY);
  await form.getByRole('button', { name: 'Оставить заявку' }).click();
  return form;
}

test('лимит: не больше 5 заявок в час с одного адреса; адрес — настоящий адрес клиента', async ({ page }) => {
  if (VIA_PROXY) await page.setExtraHTTPHeaders({ 'x-forwarded-for': FORGED_IP });

  await sendLead(page, 'E2E Лимит 1', '+7 900 000-00-03');
  await expect(page.getByText('Спасибо. Мы свяжемся с вами.')).toBeVisible();
  const keys = sql("select string_agg(key, ',') from rate_limit_events where key like 'lead:ip:%'").split(',');
  expect(keys).toHaveLength(1);
  const ip = keys[0].slice('lead:ip:'.length);
  expect(ip).toMatch(/^[0-9a-fA-F:.]+$/);   // адрес определён, не 'unknown'
  if (VIA_PROXY) expect(ip).not.toBe(FORGED_IP);   // подменённый заголовок прокси не пропустил

  // Ещё 4 отправки с этого адреса уже были — шестая получает отказ
  sql(`insert into rate_limit_events (key) select 'lead:ip:${ip}' from generate_series(1, 4)`);
  const form = await sendLead(page, 'E2E Лимит 6', '+7 900 000-00-04');
  await expect(form.getByText(/Слишком много отправок/)).toBeVisible();
  expect(sql("select count(*) from requests where contact_name = 'E2E Лимит 6'")).toBe('0');

  // С другого адреса лимит не действует: события чужого адреса не мешают
  sql("delete from rate_limit_events");
  sql(`insert into rate_limit_events (key) select 'lead:ip:203.0.113.5' from generate_series(1, 5)`);
  await sendLead(page, 'E2E Лимит другой', '+7 900 000-00-05');
  await expect(page.getByText('Спасибо. Мы свяжемся с вами.')).toBeVisible();
});

async function fillResume(page: Page, name: string, contact: string, file: string) {
  const form = await openResume(page);
  await expect(form.getByText(/Тестовый режим/)).toBeVisible();
  await form.getByLabel('Имя').fill(name);
  await form.getByLabel('Телефон или Telegram').fill(contact);
  await form.getByLabel('Город').fill('Москва');
  await form.getByLabel('Направление').selectOption({ label: 'Няня' });
  await form.getByLabel('Файл резюме').setInputFiles(file);
  await form.getByLabel('Ссылка на видео-визитку (необязательно)').fill('https://disk.yandex.ru/i/e2e');
  await form.getByLabel(/передачу резюме работодателям/).check();
  await page.waitForTimeout(HUMAN_DELAY);
  return form;
}

test('резюме: файл в закрытом хранилище, кандидат с источником «сайт», дубль по телефону объединяется', async ({ page }) => {
  let form = await fillResume(page, 'E2E Кандидатка', '+7 (901) 777-00-11', validPdf);
  await form.getByRole('button', { name: 'Отправить резюме' }).click();
  await expect(page.getByText('Спасибо! Резюме у нас.')).toBeVisible();

  const row = sql("select source || '|' || pool_status || '|' || city || '|' || position_code || '|' || consent_version || '|' || resume_path from candidates where full_name = 'E2E Кандидатка'");
  const [source, status, city, position, consent, resumePath] = row.split('|');
  expect([source, status, city, position, consent]).toEqual(['site', 'new', 'Москва', 'nanny', 'test-mode']);
  expect(resumePath).toMatch(/^site\/\d{4}-\d{2}\/[0-9a-f-]{36}\.pdf$/);
  expect(sql(`select count(*) from storage.objects where bucket_id = 'resumes' and name = '${resumePath}'`)).toBe('1');
  expect(sql("select count(*) from storage.objects where bucket_id = 'resumes' and name like 'pending/%'")).toBe('0');

  // Тот же человек, телефон в другом формате.
  form = await fillResume(page, 'E2E Кандидатка', '8 901 777 00 11', validPdf);
  await form.getByRole('button', { name: 'Отправить резюме' }).click();
  await expect(page.getByText('Спасибо! Резюме у нас.')).toBeVisible();
  expect(sql("select count(*) || '|' || bool_and('повторное резюме' = any (tags)) from candidates where phone_norm = '79017770011'")).toBe('1|true');
});

test('резюме: подделка под PDF отклоняется и удаляется из хранилища', async ({ page }) => {
  const form = await fillResume(page, 'E2E Подделка', '+7 901 777-00-22', fakePdf);
  await form.getByRole('button', { name: 'Отправить резюме' }).click();
  await expect(form.getByText('Файл повреждён или это не PDF, DOC или DOCX')).toBeVisible();
  expect(sql("select count(*) from candidates where full_name = 'E2E Подделка'")).toBe('0');
  expect(sql("select count(*) from storage.objects where bucket_id = 'resumes' and name like 'pending/%'")).toBe('0');
});

test('резюме: файл больше 10 МБ и неподходящий тип не принимаются', async ({ page }) => {
  const form = await fillResume(page, 'E2E Большой', '+7 901 777-00-33', hugePdf);
  await form.getByRole('button', { name: 'Отправить резюме' }).click();
  await expect(form.getByText('Файл больше 10 МБ')).toBeVisible();
  expect(sql("select count(*) from candidates where full_name = 'E2E Большой'")).toBe('0');
});

test('резюме без согласия не отправляется', async ({ page }) => {
  const form = await fillResume(page, 'E2E Без согласия', '+7 901 777-00-44', validPdf);
  await form.getByLabel(/передачу резюме работодателям/).uncheck();
  await form.getByRole('button', { name: 'Отправить резюме' }).click();
  await expect(form.getByText('Без согласия отправить нельзя')).toBeVisible();
  expect(sql("select count(*) from candidates where full_name = 'E2E Без согласия'")).toBe('0');
});

test('юридические страницы — заглушки с пометкой о проверке юристом, реквизиты в подвале', async ({ page }) => {
  for (const url of ['/privacy', '/consent', '/consent-resume']) {
    await page.goto(url);
    await expect(page.getByText('Текст документа проверяет юрист')).toBeVisible();
  }
  await page.goto('/');
  await expect(page.getByText('ОГРНИП 324762700059861').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Вход' }).first()).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: /зарегистр/i })).toHaveCount(0);
});
