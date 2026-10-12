// Выход на всех устройствах: удаляются все сессии пользователя, включая текущую.
import { auth } from '../../../lib/auth';
import { route } from '../../../lib/http';
import { json } from '../../../lib/errors';
import { withUser } from '../../../lib/db';
import { audit } from '../../../lib/audit';

export const POST = route('session', async ({ request }, a) => {
  await withUser(a.userId, (db) => audit(db, { actorId: a.userId, action: 'sessions.revoked_all', entityType: 'user', entityId: a.userId }));
  const ctx = await auth().$context;
  await ctx.internalAdapter.deleteUserSessions(a.userId);
  const res = await auth().api.signOut({ headers: request.headers, asResponse: true }).catch(() => null);
  const out = json({ ok: true, redirect: '/login' });
  for (const c of res?.headers.getSetCookie() ?? []) out.headers.append('set-cookie', c);
  return out;
});
