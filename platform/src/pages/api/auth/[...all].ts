// Наружу открыты только нужные маршруты Better Auth. Регистрация и прямой вход закрыты:
// вход идёт через /api/session/login, где работает ограничение попыток.
// 2FA: отключить её самостоятельно нельзя (сброс — только администратор или консольная команда),
// флаг trustDevice из запросов удаляется, чтобы второй шаг нельзя было пропустить на «доверенном устройстве».
import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';
import { json } from '../../../lib/errors';
import { withSystem, withUser } from '../../../lib/db';
import { audit } from '../../../lib/audit';
import { clientIp } from '../../../lib/request';

const ALLOWED: Record<string, string[]> = {
  '/api/auth/get-session': ['GET'],
  '/api/auth/sign-out': ['POST'],
  '/api/auth/request-password-reset': ['POST'],
  '/api/auth/reset-password': ['POST'],
  '/api/auth/two-factor/enable': ['POST'],
  '/api/auth/two-factor/verify-totp': ['POST'],
  '/api/auth/two-factor/verify-backup-code': ['POST'],
  '/api/auth/two-factor/generate-backup-codes': ['POST'],
};
const VERIFY = new Set(['/api/auth/two-factor/verify-totp', '/api/auth/two-factor/verify-backup-code']);

export const ALL: APIRoute = async ({ request, url, clientAddress }) => {
  if (!ALLOWED[url.pathname]?.includes(request.method)) return json({ error: 'not_found', message: 'Не найдено' }, 404);
  if (!url.pathname.startsWith('/api/auth/two-factor/')) return auth().handler(request);

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { return json({ error: 'bad_request', message: 'Некорректный запрос' }, 400); }
  delete body.trustDevice;
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  const res = await auth().handler(new Request(request.url, { method: 'POST', headers, body: JSON.stringify(body) }));

  const ip = clientIp(request, clientAddress);
  const action = url.pathname.split('/').pop()!;
  const data = await res.clone().json().catch(() => null) as { user?: { id?: string } } | null;
  const userId = data?.user?.id ?? null;
  if (VERIFY.has(url.pathname)) {
    if (res.ok && userId) await withUser(userId, (db) => audit(db, { actorId: userId, action: `login.2fa_${action === 'verify-totp' ? 'totp' : 'backup_code'}`, ip }));
    else if (!res.ok) await withSystem((db) => audit(db, { actorId: null, kind: 'public', action: 'login.2fa_failed', ip, details: { method: action } }));
  } else if (res.ok) {
    await withSystem((db) => audit(db, { actorId: null, kind: 'system', action: `2fa.${action}`, ip }));
  }
  return res;
};
