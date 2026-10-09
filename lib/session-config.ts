// Имена cookie и сроки сессии. Без server-only: используется и в proxy.ts.

/** Время последней активности пользователя (мс с эпохи). */
export const ACTIVITY_COOKIE = 'ikr_activity';
/** Начало сессии (мс с эпохи): ограничивает общую длительность входа. */
export const SESSION_START_COOKIE = 'ikr_session_start';
/** id ожидающего кода входа (второй шаг для админа). */
export const LOGIN_CHALLENGE_COOKIE = 'ikr_login_challenge';

export function idleMinutes(): number {
  return Number(process.env.SESSION_IDLE_MINUTES) || 30;
}

export function maxSessionHours(): number {
  return Number(process.env.SESSION_MAX_HOURS) || 12;
}

export const secureCookies = process.env.NODE_ENV === 'production';

export const baseCookieOptions = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: 'lax' as const,
  path: '/',
};

/** Сессия истекла по бездействию или по общей длительности. */
export function sessionExpired(activity: string | undefined, start: string | undefined, now = Date.now()): boolean {
  const last = Number(activity);
  const began = Number(start);
  if (!Number.isFinite(last) || last <= 0 || !Number.isFinite(began) || began <= 0) return true;
  if (now - last > idleMinutes() * 60_000) return true;
  if (now - began > maxSessionHours() * 3_600_000) return true;
  return false;
}
