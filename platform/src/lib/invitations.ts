// Приглашения: единственный способ получить доступ к кабинету.
// Токен 32 случайных байта; в базе только SHA-256. Срок 72 часа, одноразовый.
import { createHash, randomBytes } from 'node:crypto';
import { auth } from './auth';
import { env } from './env';
import { withSystem, withUser } from './db';
import { audit } from './audit';
import { sendMail, templates } from './mailer';
import { badRequest, conflict, notFound } from './errors';

const TTL_HOURS = 72;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function createInvitation(actorId: string, input: { email: string; companyId?: string; memberRole?: 'owner' | 'member' | 'viewer'; staffRole?: 'admin' }, ip?: string) {
  const email = normalizeEmail(input.email);
  if (!!input.companyId === !!input.staffRole) throw badRequest('Укажите компанию с ролью клиента или роль сотрудника');
  const token = randomBytes(32).toString('base64url');
  const invitation = await withUser(actorId, async (db) => {
    let companyName: string | null = null;
    if (input.companyId) {
      const c = await db.query('select name from companies where id = $1', [input.companyId]);   // RLS: только администратор
      if (!c.rowCount) throw notFound();
      companyName = c.rows[0].name;
      const already = await db.query(
        `select 1 from company_members m join "user" u on u.id = m.user_id where u.email = $1 and m.company_id = $2 and m.revoked_at is null`,
        [email, input.companyId]);
      if (already.rowCount) throw conflict('У этого пользователя уже есть доступ к компании');
    }
    // Новое приглашение отменяет прежние неиспользованные на ту же почту и в ту же компанию
    await db.query(
      `update invitations set revoked_at = now(), revoked_by = $1
        where email = $2 and accepted_at is null and revoked_at is null and company_id is not distinct from $3::uuid`,
      [actorId, email, input.companyId ?? null]);
    const r = await db.query(
      `insert into invitations(email, company_id, member_role, staff_role, token_hash, expires_at, created_by)
       values ($1, $2, $3, $4, $5, now() + make_interval(hours => $6), $7) returning id, email, company_id, member_role, staff_role, expires_at, created_at`,
      [email, input.companyId ?? null, input.companyId ? (input.memberRole ?? 'member') : null, input.staffRole ?? null, hash(token), TTL_HOURS, actorId]);
    await audit(db, { actorId, action: 'invitation.created', entityType: 'invitation', entityId: r.rows[0].id, companyId: input.companyId ?? null, ip,
      details: { role: input.memberRole ?? input.staffRole } });
    return { ...r.rows[0], companyName };
  });
  const link = `${env().BASE_URL}/invite/${token}`;
  await sendMail({ to: email, ...templates.invitation(link, invitation.companyName) });
  return invitation;
}

// Создание первого администратора из консоли (scripts/create-admin.ts): без пользователя в сессии
export async function createStaffInvitationSystem(email: string) {
  const token = randomBytes(32).toString('base64url');
  const e = normalizeEmail(email);
  await withSystem(async (db) => {
    await db.query(`update invitations set revoked_at = now() where email = $1 and staff_role is not null and accepted_at is null and revoked_at is null`, [e]);
    const r = await db.query(
      `insert into invitations(email, staff_role, token_hash, expires_at) values ($1, 'admin', $2, now() + make_interval(hours => $3)) returning id`,
      [e, hash(token), TTL_HOURS]);
    await audit(db, { actorId: null, kind: 'system', action: 'invitation.created', entityType: 'invitation', entityId: r.rows[0].id, details: { role: 'admin', via: 'cli' } });
  });
  const link = `${env().BASE_URL}/invite/${token}`;
  await sendMail({ to: e, ...templates.invitation(link, null) });
  return link;
}

async function findValid(db: import('./db').Db, token: string, lock = false) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const r = await db.query(
    `select i.* from invitations i
      where i.token_hash = $1 and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
      ${lock ? 'for update of i' : ''}`, [hash(token)]);
  return r.rows[0] ?? null;
}

// Для страницы приглашения отдаём только почту и тип доступа: до входа данные компании не раскрываем.
export async function describeInvitation(token: string) {
  return withSystem(async (db) => {
    const inv = await findValid(db, token);
    if (!inv) return null;
    return { email: inv.email, kind: inv.staff_role ? 'staff' : 'client' };
  });
}

export async function acceptInvitation(input: { token: string; name: string; password: string }, ip?: string) {
  const a = auth();
  const ctx = await a.$context;
  if (input.password.length < 10 || input.password.length > 128) throw badRequest('Пароль: от 10 до 128 символов', { password: 'От 10 до 128 символов' });
  return withSystem(async (db) => {
    const inv = await findValid(db, input.token, true);
    if (!inv) throw badRequest('Ссылка недействительна или устарела. Попросите менеджера отправить новое приглашение.');
    const existing = await db.query('select u.id, coalesce(s.is_blocked, false) as blocked from "user" u left join user_security s on s.user_id = u.id where u.email = $1', [inv.email]);
    let userId: string;
    let created = false;
    if (existing.rowCount) {
      if (existing.rows[0].blocked) throw badRequest('Ссылка недействительна или устарела. Попросите менеджера отправить новое приглашение.');
      userId = existing.rows[0].id;    // у человека уже есть аккаунт: добавляем доступ, пароль не меняем
    } else {
      const user = await ctx.internalAdapter.createUser({ email: inv.email, name: input.name.trim(), emailVerified: true }, { method: 'invitation' });
      userId = user.id;
      created = true;
      try {
        await ctx.internalAdapter.createAccount({ userId, providerId: 'credential', accountId: userId, password: await ctx.password.hash(input.password) });
      } catch (e) {
        await ctx.internalAdapter.deleteUser(userId);
        throw e;
      }
    }
    try {
      await db.query('insert into user_security(user_id) values ($1) on conflict do nothing', [userId]);
      await db.query('select grant_invitation($1, $2)', [inv.id, userId]);
      await db.query("select set_config('app.user_id', $1, true)", [userId]);
      await audit(db, { actorId: userId, action: 'invitation.accepted', entityType: 'invitation', entityId: inv.id, companyId: inv.company_id, ip });
    } catch (e) {
      if (created) await ctx.internalAdapter.deleteUser(userId).catch(() => {});
      throw e;
    }
    return { email: inv.email as string, existingAccount: !created };
  });
}

export async function revokeInvitation(actorId: string, id: string) {
  return withUser(actorId, async (db) => {
    const r = await db.query(`update invitations set revoked_at = now(), revoked_by = $2 where id = $1 and accepted_at is null and revoked_at is null returning company_id`, [id, actorId]);
    if (!r.rowCount) throw notFound();
    await audit(db, { actorId, action: 'invitation.revoked', entityType: 'invitation', entityId: id, companyId: r.rows[0].company_id });
  });
}
