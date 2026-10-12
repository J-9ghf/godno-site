// Пользователи и доступы (только администратор): блокировка, разблокировка, отзыв доступа к компании.
import { auth } from './auth';
import { withSystem, withUser } from './db';
import { audit } from './audit';
import { badRequest, notFound } from './errors';

export async function listUsers(actorId: string) {
  return withUser(actorId, async (db) => (await db.query(
    `select u.id, u.name, u.email, u."createdAt" as created_at, coalesce(u."twoFactorEnabled", false) as two_factor_enabled,
            (select count(*) from session se where se."userId" = u.id and se."expiresAt" > now())::int as active_sessions,
            coalesce(s.is_blocked, false) as is_blocked, s.blocked_at, s.last_login_at,
            r.role as staff_role,
            coalesce((select json_agg(json_build_object('membership_id', m.id, 'company_id', m.company_id, 'company_name', c.name, 'role', m.role, 'revoked_at', m.revoked_at))
                        from company_members m join companies c on c.id = m.company_id where m.user_id = u.id), '[]') as memberships
       from "user" u left join user_security s on s.user_id = u.id left join staff_roles r on r.user_id = u.id
      where exists (select 1 from staff_roles where user_id = $1 and role = 'admin')
      order by u.name`, [actorId])).rows);
}

export async function setBlocked(actorId: string, userId: string, blocked: boolean, reason?: string) {
  if (userId === actorId) throw badRequest('Нельзя заблокировать самого себя');
  await withUser(actorId, async (db) => {
    const exists = await db.query('select 1 from "user" where id = $1 and app_is_admin()', [userId]);
    if (!exists.rowCount) throw notFound();
    await db.query(
      `insert into user_security(user_id, is_blocked, blocked_at, blocked_by, blocked_reason) values ($1, $2, case when $2 then now() end, $3, $4)
       on conflict (user_id) do update set is_blocked = $2, blocked_at = case when $2 then now() end,
         blocked_by = case when $2 then $3 end, blocked_reason = case when $2 then $4 end`,
      [userId, blocked, actorId, reason ?? null]);
    await audit(db, { actorId, action: blocked ? 'user.blocked' : 'user.unblocked', entityType: 'user', entityId: userId, details: { reason: reason ?? null } });
  });
  if (blocked) {
    const ctx = await auth().$context;
    await ctx.internalAdapter.deleteUserSessions(userId);   // все входы пользователя закрываются сразу
  }
}

export async function revokeMembership(actorId: string, membershipId: string) {
  await withUser(actorId, async (db) => {
    const r = await db.query(
      `update company_members set revoked_at = now(), revoked_by = $2 where id = $1 and revoked_at is null returning user_id, company_id`,
      [membershipId, actorId]);
    if (!r.rowCount) throw notFound();
    await audit(db, { actorId, action: 'membership.revoked', entityType: 'company_member', entityId: membershipId, companyId: r.rows[0].company_id,
      details: { user_id: r.rows[0].user_id } });
  });
}

// Завершить все сессии пользователя (например, при подозрении на утечку пароля)
export async function revokeSessions(actorId: string, userId: string) {
  await withUser(actorId, async (db) => {
    const exists = await db.query('select 1 from "user" where id = $1 and app_is_admin()', [userId]);
    if (!exists.rowCount) throw notFound();
    await audit(db, { actorId, action: 'sessions.revoked_by_admin', entityType: 'user', entityId: userId });
  });
  const ctx = await auth().$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}

// Сброс 2FA (восстановление доступа, когда потеряны и приложение, и резервные коды).
// Сессии пользователя закрываются; при следующем входе администратор обязан настроить 2FA заново.
export async function resetTwoFactor(actorId: string | null, userId: string) {
  if (actorId && actorId === userId) throw badRequest('Сбросить собственную 2FA нельзя: попросите другого администратора');
  const run = async (db: import('./db').Db) => {
    const u = await db.query('select id from "user" where id = $1', [userId]);
    if (!u.rowCount) throw notFound();
    if (actorId) {
      const isAdmin = await db.query('select app_is_admin() as ok');
      if (!isAdmin.rows[0].ok) throw notFound();
    }
    await db.query('delete from "twoFactor" where "userId" = $1', [userId]);
    await db.query('update "user" set "twoFactorEnabled" = false where id = $1', [userId]);
    await audit(db, { actorId, kind: actorId ? 'user' : 'system', action: '2fa.reset', entityType: 'user', entityId: userId });
  };
  if (actorId) await withUser(actorId, run); else await withSystem(run);
  const ctx = await auth().$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}
