// Для каждого запроса: заголовки безопасности, проверка Origin у изменяющих запросов к API,
// определение пользователя по сессии. Страницы кабинета без входа перенаправляют на /login.
import { defineMiddleware } from 'astro:middleware';
import { env } from './lib/env';
import { resolveActor } from './lib/session';
import { json } from './lib/errors';

const PUBLIC_API = ['/api/auth/', '/api/session/login', '/api/invitations/'];
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function secure(res: Response, isPage: boolean) {
  const h = res.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'same-origin');
  h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (env().BASE_URL.startsWith('https://')) h.set('Strict-Transport-Security', 'max-age=31536000');
  if (isPage && !h.has('Content-Security-Policy')) {
    h.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
  }
  return res;
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  const isApi = pathname.startsWith('/api/');
  ctx.locals.actor = null;

  if (isApi && UNSAFE.has(ctx.request.method)) {
    const origin = ctx.request.headers.get('origin');
    if (origin !== new URL(env().BASE_URL).origin) return secure(json({ error: 'forbidden', message: 'Запрос с чужого адреса' }, 403), false);
  }

  const needsActor = pathname.startsWith('/app') || (isApi && !PUBLIC_API.some((p) => pathname.startsWith(p)));
  if (needsActor) {
    try { ctx.locals.actor = await resolveActor(ctx.request); }
    catch (e) { console.error('[session]', (e as Error).message); ctx.locals.actor = null; }
    if (pathname.startsWith('/app') && !ctx.locals.actor) return secure(ctx.redirect('/login'), true);
  }

  const res = await next();
  for (const c of ctx.locals.actor?.setCookie ?? []) res.headers.append('set-cookie', c);
  if (isApi) res.headers.set('Cache-Control', res.headers.get('Cache-Control') ?? 'no-store');
  return secure(res, !isApi);
});
