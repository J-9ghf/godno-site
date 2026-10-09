import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'IkrDemo-2026!';
const OUTBOX = process.env.EMAIL_OUTBOX_FILE ?? '/tmp/ikr-outbox.jsonl';
const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** SQL против локальной базы — только подготовка данных теста. */
export function sql(query: string): string {
  return execFileSync('psql', ['-X', '-q', '-t', '-A', DB_URL, '-c', query], { encoding: 'utf8' }).trim();
}

/** Последнее письмо на адрес, отправленное после момента since. */
export async function lastEmail(to: string, since: number): Promise<{ subject: string; text: string }> {
  for (let i = 0; i < 40; i++) {
    if (existsSync(OUTBOX)) {
      const mails = readFileSync(OUTBOX, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .filter((m) => m.to === to && m.at >= since);
      if (mails.length) return mails[mails.length - 1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Нет письма на ${to}`);
}

export function linkFrom(text: string): string {
  const m = text.match(/https?:\/\/\S+/);
  if (!m) throw new Error('В письме нет ссылки');
  return new URL(m[0]).pathname;
}

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Почта').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
}

export async function loginAdmin(page: Page, email = 'admin@example.com') {
  const since = Date.now();
  await login(page, email);
  await expect(page).toHaveURL(/\/login\/code$/);
  const mail = await lastEmail(email, since);
  const code = mail.subject.match(/\d{6}/)![0];
  await page.getByLabel('Код из письма').fill(code);
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export function resetAuthState() {
  sql("delete from login_attempts; delete from rate_limit_events; update profiles set is_active = true; update auth.users set banned_until = null;");
}
