// Смена пароля вошедшим пользователем: проверка текущего пароля, закрытие всех остальных сессий.
import { z } from 'zod';
import { auth } from '../../../lib/auth';
import { route, body } from '../../../lib/http';
import { badRequest, json } from '../../../lib/errors';
import { withUser } from '../../../lib/db';
import { audit } from '../../../lib/audit';

const schema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10, 'Не короче 10 символов').max(128) });
export const POST = route('session', async ({ request }, a) => {
  const i = await body(request, schema);
  if (i.currentPassword === i.newPassword) throw badRequest('Новый пароль совпадает с текущим', { newPassword: 'Придумайте другой пароль' });
  const res = await auth().api.changePassword({ body: { ...i, revokeOtherSessions: true }, headers: request.headers, asResponse: true });
  if (!res.ok) throw badRequest('Текущий пароль указан неверно', { currentPassword: 'Неверный пароль' });
  await withUser(a.userId, (db) => audit(db, { actorId: a.userId, action: 'password.changed', details: { other_sessions_revoked: true } }));
  const out = json({ ok: true });
  for (const c of res.headers.getSetCookie()) out.headers.append('set-cookie', c);
  return out;
});
