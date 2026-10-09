import 'server-only';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Случайный токен для ссылки: 256 бит, base64url. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 6-значный код входа. */
export function randomCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Поле session_id из access token Supabase (без проверки подписи: токен только что выдан Auth). */
export function sessionIdFromJwt(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}
