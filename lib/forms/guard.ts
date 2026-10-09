import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { adminClient } from '@/lib/supabase/admin';
import { HONEYPOT_FIELD } from './honeypot';

const DEV_SECRET = 'dev-only-secret-not-for-production-use-0000';
const MIN_FILL_MS = 3_000;
const MAX_FORM_AGE_MS = 24 * 3_600_000;

function secret(): string {
  return env().APP_SECRET ?? DEV_SECRET;
}

export function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function verifySignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Токен формы: время выдачи + подпись. Боты, которые отправляют форму мгновенно или без страницы, отсекаются. */
export function issueFormToken(now = Date.now()): string {
  return `${now}.${sign(`form:${now}`)}`;
}

export function checkFormToken(token: unknown, now = Date.now()): boolean {
  if (typeof token !== 'string') return false;
  const [ts, sig] = token.split('.');
  const issued = Number(ts);
  if (!Number.isFinite(issued) || !sig || !verifySignature(`form:${ts}`, sig)) return false;
  const age = now - issued;
  return age >= MIN_FILL_MS && age <= MAX_FORM_AGE_MS;
}

/** Ловушка для ботов: скрытое поле, которое человек не видит и не заполняет. */

export function honeypotTripped(formData: FormData): boolean {
  const v = formData.get(HONEYPOT_FIELD);
  return typeof v === 'string' && v.trim() !== '';
}

/** Капча: Яндекс SmartCaptcha (сервис в РФ). При CAPTCHA_PROVIDER=off проверка пропускается — только для разработки. */
export async function verifyCaptcha(token: unknown, ip: string | null): Promise<boolean> {
  const { CAPTCHA_PROVIDER, SMARTCAPTCHA_SERVER_KEY } = env();
  if (CAPTCHA_PROVIDER === 'off') return true;
  if (typeof token !== 'string' || !token || !SMARTCAPTCHA_SERVER_KEY) return false;
  const params = new URLSearchParams({ secret: SMARTCAPTCHA_SERVER_KEY, token });
  if (ip) params.set('ip', ip);
  try {
    const res = await fetch('https://smartcaptcha.yandexcloud.net/validate', {
      method: 'POST',
      body: params,
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await res.json()) as { status?: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}

/** Лимит отправок: true — лимит превышен. Ключ учитывает IP. */
export async function rateLimited(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await adminClient().rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) throw new Error(`rate_limit_hit: ${error.message}`);
  return Boolean(data);
}
