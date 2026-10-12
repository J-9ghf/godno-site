import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';
import { withUser } from '../../../lib/db';
import { audit } from '../../../lib/audit';
import { json } from '../../../lib/errors';

export const POST: APIRoute = async ({ request, locals }) => {
  const res = await auth().api.signOut({ headers: request.headers, asResponse: true }).catch(() => null);
  if (locals.actor) await withUser(locals.actor.userId, (db) => audit(db, { actorId: locals.actor!.userId, action: 'logout' }));
  const out = json({ ok: true, redirect: '/login' });
  for (const c of res?.headers.getSetCookie() ?? []) out.headers.append('set-cookie', c);
  return out;
};
