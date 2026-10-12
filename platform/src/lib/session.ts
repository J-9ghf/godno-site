// Кто делает запрос: сессия Better Auth + роль и компании из базы.
// Заблокированный пользователь и сессия старше SESSION_MAX_HOURS не проходят: их сессии удаляются.
import { auth } from './auth';
import { env } from './env';
import { withUser } from './db';

export type Membership = { companyId: string; companyName: string; role: 'owner' | 'member' | 'viewer' };
export type Actor = {
  userId: string; email: string; name: string;
  kind: 'admin' | 'client' | 'none';
  memberships: Membership[];
  setCookie: string[];
};

export async function resolveActor(request: Request): Promise<Actor | null> {
  const a = auth();
  const res = await a.api.getSession({ headers: request.headers, returnHeaders: true });
  const data = res.response;
  if (!data?.session || !data.user) return null;
  const setCookie = res.headers?.getSetCookie?.() ?? [];

  const maxAgeMs = env().SESSION_MAX_HOURS * 3600_000;
  if (Date.now() - new Date(data.session.createdAt).getTime() > maxAgeMs) {
    const ctx = await a.$context;
    await ctx.internalAdapter.deleteSession(data.session.token);
    return null;
  }

  const info = await withUser(data.user.id, async (db) => {
    const r = await db.query(
      `select coalesce(s.is_blocked, false) as blocked,
              (select role from staff_roles where user_id = $1) as staff_role,
              coalesce((select json_agg(json_build_object('companyId', m.company_id, 'companyName', c.name, 'role', m.role) order by c.name)
                          from company_members m join companies c on c.id = m.company_id
                         where m.user_id = $1 and m.revoked_at is null and c.status <> 'archived'), '[]') as memberships
         from (select 1) x left join user_security s on s.user_id = $1`, [data.user.id]);
    return r.rows[0];
  });
  if (info.blocked) {
    const ctx = await a.$context;
    await ctx.internalAdapter.deleteUserSessions(data.user.id);
    return null;
  }
  const memberships = info.memberships as Membership[];
  return {
    userId: data.user.id, email: data.user.email, name: data.user.name,
    kind: info.staff_role === 'admin' ? 'admin' : memberships.length ? 'client' : 'none',
    memberships, setCookie,
  };
}
