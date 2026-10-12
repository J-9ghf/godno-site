import type { APIRoute } from 'astro';
import { z } from 'zod';
import { auth } from '../../../lib/auth';
import { withSystem } from '../../../lib/db';
import { audit } from '../../../lib/audit';
import { json, toResponse } from '../../../lib/errors';
import { body } from '../../../lib/http';
import { clientIp } from '../../../lib/request';
import { normalizeEmail } from '../../../lib/invitations';
import { LIMITS, clear, emailKey, ipKey, lockedUntil, registerFailure } from '../../../lib/throttle';

const schema = z.object({ email: z.string().max(254), password: z.string().max(128) });
const GENERIC = 'Неверная почта или пароль';
const LOCKED = 'Слишком много попыток входа. Попробуйте через 15 минут или восстановите пароль.';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const input = await body(request, schema);
    const email = normalizeEmail(input.email);
    const ip = clientIp(request, clientAddress);
    const keys = [emailKey(email), ipKey(ip)];

    const pre = await withSystem(async (db) => ({
      locked: await lockedUntil(db, keys),
      user: (await db.query('select u.id, coalesce(s.is_blocked, false) as blocked from "user" u left join user_security s on s.user_id = u.id where u.email = $1', [email])).rows[0] ?? null,
    }));
    if (pre.locked) {
      await withSystem((db) => audit(db, { actorId: pre.user?.id ?? null, kind: 'public', action: 'login.locked', ip }));
      return json({ error: 'locked', message: LOCKED }, 429);
    }

    let ok = false;
    let res: Response | null = null;
    if (pre.user && !pre.user.blocked) {
      res = await auth().api.signInEmail({ body: { email, password: input.password }, headers: request.headers, asResponse: true });
      ok = res.ok;
    } else {
      // Выравниваем время ответа: хэшируем пароль, даже если пользователя нет или он заблокирован
      const ctx = await auth().$context;
      await ctx.password.hash(input.password || 'x');
    }

    if (!ok || !res) {
      const nowLocked = await withSystem(async (db) => {
        const byEmail = await registerFailure(db, keys[0], LIMITS.email);
        const byIp = await registerFailure(db, keys[1], LIMITS.ip);
        await audit(db, { actorId: pre.user?.id ?? null, kind: 'public', action: 'login.failed', ip, details: { blocked: pre.user?.blocked ?? false } });
        return byEmail || byIp;
      });
      return json({ error: nowLocked ? 'locked' : 'invalid', message: nowLocked ? LOCKED : GENERIC }, nowLocked ? 429 : 401);
    }

    const data2fa = ((await res.clone().json().catch(() => ({}))) as { twoFactorRedirect?: boolean }).twoFactorRedirect === true;
    await withSystem(async (db) => {
      await clear(db, keys[0]);
      await db.query("select set_config('app.user_id', $1, true)", [pre.user.id]);
      await db.query('insert into user_security(user_id, last_login_at) values ($1, now()) on conflict (user_id) do update set last_login_at = now()', [pre.user.id]);
      await audit(db, { actorId: pre.user.id, action: data2fa ? 'login.password_ok_2fa_pending' : 'login.success', ip });
    });
    // Если у пользователя включена 2FA, Better Auth не создаёт сессию, а выдаёт временный cookie второго шага
    const data = await res.clone().json().catch(() => ({})) as { twoFactorRedirect?: boolean };
    const out = data.twoFactorRedirect ? json({ ok: true, twoFactor: true }) : json({ ok: true, redirect: '/app' });
    for (const c of res.headers.getSetCookie()) out.headers.append('set-cookie', c);
    return out;
  } catch (e) {
    return toResponse(e);
  }
};
