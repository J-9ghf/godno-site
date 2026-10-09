import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, lastEmail, linkFrom, login, loginAdmin, resetAuthState, sql } from './helpers';

test.beforeEach(() => resetAuthState());

test('закрытые разделы без входа ведут на страницу входа', async ({ page }) => {
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusers/);
  await page.goto('/cabinet');
  await expect(page).toHaveURL(/\/login\?next=%2Fcabinet/);
});

test('страница входа не раскрывает, есть ли такая почта', async ({ page }) => {
  await login(page, 'alfa.lead@example.com', 'wrong-password');
  const wrongPassword = await page.getByRole('main').getByRole('alert').textContent();
  await login(page, 'nobody-here@example.com', 'wrong-password');
  const unknownEmail = await page.getByRole('main').getByRole('alert').textContent();
  expect(wrongPassword).toBe('Неверная почта или пароль.');
  expect(unknownEmail).toBe(wrongPassword);
  await expect(page.getByRole('link', { name: /зарегистр/i })).toHaveCount(0);
});

test('клиент входит в свой кабинет, в кабинет команды не попадает, выходит', async ({ page }) => {
  await login(page, 'alfa.lead@example.com');
  await expect(page).toHaveURL(/\/cabinet$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Анна Альфова');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/cabinet$/);
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/login\?reason=logout/);
  await page.goto('/cabinet');
  await expect(page).toHaveURL(/\/login/);
  expect(Number(sql("select count(*) from audit_log where action = 'auth.login' and actor_email = 'alfa.lead@example.com'"))).toBeGreaterThan(0);
});

test('после 5 неверных попыток вход блокируется на 15 минут', async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await login(page, 'alfa.hr@example.com', `wrong-${i}`);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Неверная почта или пароль.');
  }
  await login(page, 'alfa.hr@example.com');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Слишком много попыток входа. Попробуйте через 15 минут.');
  await expect(page).toHaveURL(/\/login$/);
  // Для несуществующей почты — тот же ответ.
  for (let i = 0; i < 5; i++) await login(page, 'ghost@example.com', `wrong-${i}`);
  await login(page, 'ghost@example.com', 'wrong');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Слишком много попыток входа. Попробуйте через 15 минут.');
});

test('админ входит только с кодом из письма', async ({ page }) => {
  const since = Date.now();
  await login(page, 'admin@example.com');
  await expect(page).toHaveURL(/\/login\/code$/);
  // Без кода кабинет закрыт.
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);

  await page.goto('/login/code');
  await page.getByLabel('Код из письма').fill('000000');
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page.getByText(/Неверный код\. Осталось попыток: 4/)).toBeVisible();

  const code = (await lastEmail('admin@example.com', since)).subject.match(/\d{6}/)![0];
  await page.getByLabel('Код из письма').fill(code);
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Пользователи и доступы' }).click();
  await expect(page.getByRole('heading', { name: 'Пользователи и доступы' })).toBeVisible();
});

test('менеджер входит без кода и не видит раздел пользователей', async ({ page }) => {
  await login(page, 'manager1@example.com');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('link', { name: 'Пользователи и доступы' })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/admin$/);
});

test('приглашение: одноразовая ссылка, пароль не короче 10 символов, вход в кабинет', async ({ page, browser }) => {
  const email = `invitee-${Date.now()}@example.com`;
  await loginAdmin(page);
  await page.goto('/admin/users');
  const since = Date.now();
  const invite = page.locator('form', { has: page.getByRole('button', { name: 'Отправить приглашение' }) });
  await invite.getByLabel('Почта').fill(email);
  await invite.getByLabel('Имя').fill('Новый Клиент');
  await invite.getByLabel('Компания').selectOption({ label: 'Демо-компания «Альфа»' });
  await invite.getByRole('button', { name: 'Отправить приглашение' }).click();
  await expect(page.getByText(`Приглашение отправлено на ${email}`)).toBeVisible();

  const mail = await lastEmail(email, since);
  expect(mail.subject).toBe('Ваш личный кабинет в Институте кадровых решений');
  const link = linkFrom(mail.text);

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(link);
  await guest.getByLabel('Новый пароль').fill('short');
  await guest.getByLabel('Повторите пароль').fill('short');
  await guest.getByRole('button', { name: 'Задать пароль и войти' }).click();
  await expect(guest.getByText('Пароль должен быть не короче 10 символов')).toBeVisible();

  await guest.getByLabel('Новый пароль').fill('Strong-pass-42');
  await guest.getByLabel('Повторите пароль').fill('Strong-pass-42');
  await guest.getByRole('button', { name: 'Задать пароль и войти' }).click();
  await expect(guest).toHaveURL(/\/cabinet$/);
  await expect(guest.getByText('Демо-компания «Альфа»')).toBeVisible();

  // Повторно ссылка не работает.
  await guest.goto(link);
  await expect(guest.getByRole('heading', { name: 'Ссылка не работает' })).toBeVisible();
  await ctx.close();

  expect(sql(`select role || ':' || is_company_lead from profiles where email = '${email}'`)).toBe('client:true');
});

test('просроченное приглашение не открывается', async ({ page }) => {
  await page.goto('/invite/this-token-does-not-exist-anywhere-123');
  await expect(page.getByRole('heading', { name: 'Ссылка не работает' })).toBeVisible();
});

test('восстановление пароля: одинаковый ответ, одноразовая ссылка, вход с новым паролем', async ({ page }) => {
  await page.goto('/forgot');
  await page.getByLabel('Почта').fill('nobody-here@example.com');
  await page.getByRole('button', { name: 'Отправить ссылку' }).click();
  const unknown = await page.getByRole('status').textContent();

  const since = Date.now();
  await page.goto('/forgot');
  await page.getByLabel('Почта').fill('beta.lead@example.com');
  await page.getByRole('button', { name: 'Отправить ссылку' }).click();
  expect(await page.getByRole('status').textContent()).toBe(unknown);

  const link = linkFrom((await lastEmail('beta.lead@example.com', since)).text);
  await page.goto(link);
  await page.getByLabel('Новый пароль').fill('Another-pass-77');
  await page.getByLabel('Повторите пароль').fill('Another-pass-77');
  await page.getByRole('button', { name: 'Сохранить пароль' }).click();
  await expect(page).toHaveURL(/\/login\?reason=reset/);

  await login(page, 'beta.lead@example.com', 'Another-pass-77');
  await expect(page).toHaveURL(/\/cabinet$/);

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Ссылка не работает' })).toBeVisible();

  // Вернуть демо-пароль для других тестов.
  sql(`update auth.users set encrypted_password = extensions.crypt('${DEMO_PASSWORD}', extensions.gen_salt('bf')) where email = 'beta.lead@example.com'`);
});

test('отключение пользователя одним действием закрывает уже открытую сессию', async ({ page, browser }) => {
  const ctx = await browser.newContext();
  const client = await ctx.newPage();
  await login(client, 'alfa.hr@example.com');
  await expect(client).toHaveURL(/\/cabinet$/);

  await loginAdmin(page);
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Отключить alfa.hr@example.com' }).click();
  await expect(page.getByRole('button', { name: 'Включить alfa.hr@example.com' })).toBeVisible();

  await client.reload();
  await expect(client).toHaveURL(/\/login/);
  await login(client, 'alfa.hr@example.com');
  await expect(client.getByRole('main').getByRole('alert')).toHaveText('Неверная почта или пароль.');

  await page.getByRole('button', { name: 'Включить alfa.hr@example.com' }).click();
  await expect(page.getByRole('button', { name: 'Отключить alfa.hr@example.com' })).toBeVisible();
  await login(client, 'alfa.hr@example.com');
  await expect(client).toHaveURL(/\/cabinet$/);
  await ctx.close();
});

test('автовыход после 30 минут бездействия', async ({ page, context }) => {
  await login(page, 'alfa.lead@example.com');
  await expect(page).toHaveURL(/\/cabinet$/);
  const cookies = await context.cookies();
  const activity = cookies.find((c) => c.name === 'ikr_activity')!;
  expect(activity.httpOnly).toBe(true);
  await context.addCookies([{ ...activity, value: String(Date.now() - 31 * 60_000) }]);
  await page.goto('/cabinet');
  await expect(page).toHaveURL(/\/login\?reason=idle/);
  await expect(page.getByText('Вы вышли из кабинета после 30 минут бездействия')).toBeVisible();
});

test('cookie сессии недоступны скриптам страницы', async ({ page, context }) => {
  await login(page, 'alfa.lead@example.com');
  await expect(page).toHaveURL(/\/cabinet$/);
  const sb = (await context.cookies()).filter((c) => c.name.startsWith('sb-'));
  expect(sb.length).toBeGreaterThan(0);
  for (const c of sb) expect(c.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain('sb-');
});
