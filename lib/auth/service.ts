import 'server-only';
import { cookies } from 'next/headers';
import { adminClient } from '@/lib/supabase/admin';
import { createStatelessClient, createUserClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email';
import { invitationEmail, loginCodeEmail, passwordResetEmail } from '@/lib/email/templates';
import {
  ACTIVITY_COOKIE,
  LOGIN_CHALLENGE_COOKIE,
  SESSION_START_COOKIE,
  baseCookieOptions,
  maxSessionHours,
} from '@/lib/session-config';
import { audit } from './audit';
import { randomCode, randomToken, safeEqualHex, sessionIdFromJwt, sha256 } from './crypto';
import { requestMeta } from './request-meta';
import type { Role } from './access';

const LOGIN_CODE_TTL_MIN = 10;
const LOGIN_CODE_MAX_ATTEMPTS = 5;
const RESET_TTL_MIN = 60;
const INVITATION_TTL_HOURS = 72;

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  company_id: string | null;
  is_active: boolean;
}

async function findProfileByEmail(email: string): Promise<ProfileRow | null> {
  const { data } = await adminClient()
    .from('profiles')
    .select('id, email, full_name, role, company_id, is_active')
    .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle<ProfileRow>();
  return data ?? null;
}

async function findProfileById(id: string): Promise<ProfileRow | null> {
  const { data } = await adminClient()
    .from('profiles')
    .select('id, email, full_name, role, company_id, is_active')
    .eq('id', id)
    .maybeSingle<ProfileRow>();
  return data ?? null;
}

/** Отметки начала сессии и активности: по ним proxy.ts делает автовыход. */
async function markSessionStarted() {
  const store = await cookies();
  const now = String(Date.now());
  const maxAge = maxSessionHours() * 3600;
  store.set(ACTIVITY_COOKIE, now, { ...baseCookieOptions, maxAge });
  store.set(SESSION_START_COOKIE, now, { ...baseCookieOptions, maxAge });
}

// ───────────────────────── Вход ─────────────────────────

export type LoginResult =
  | { kind: 'ok'; role: Role }
  | { kind: 'code_required' }
  | { kind: 'invalid' }
  | { kind: 'locked' };

export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  const admin = adminClient();
  const { ip } = await requestMeta();

  const { data: lockedUntil } = await admin.rpc('login_locked_until', { p_email: email, p_ip: ip });
  if (lockedUntil) {
    await audit({ action: 'auth.login_locked', actorEmail: email });
    return { kind: 'locked' };
  }

  const stateless = createStatelessClient();
  const { data, error } = await stateless.auth.signInWithPassword({ email, password });

  const fail = async (reason: string, userId?: string) => {
    await admin.from('login_attempts').insert({ email, ip, success: false });
    await audit({ action: 'auth.login_failed', actorId: userId ?? null, actorEmail: email, details: { reason } });
    return { kind: 'invalid' } as const;
  };

  if (error || !data.session) return fail('credentials');

  const profile = await findProfileById(data.user.id);
  if (!profile || !profile.is_active) {
    await admin.auth.admin.signOut(data.session.access_token).catch(() => undefined);
    return fail(profile ? 'disabled' : 'no_profile', data.user.id);
  }

  await admin.from('login_attempts').insert({ email, ip, success: true });

  if (profile.role === 'admin') {
    // Пароль верный, но сессию админу не выдаём до проверки кода.
    await admin.auth.admin.signOut(data.session.access_token).catch(() => undefined);
    await issueLoginCode(profile);
    await audit({ action: 'auth.login_code_sent', actorId: profile.id, actorEmail: profile.email, actorRole: 'admin' });
    return { kind: 'code_required' };
  }

  const supabase = await createUserClient();
  const { error: setError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setError) return fail('session');
  await markSessionStarted();
  await audit({ action: 'auth.login', actorId: profile.id, actorEmail: profile.email, actorRole: profile.role });
  return { kind: 'ok', role: profile.role };
}

// ───────────────────────── Второй шаг: код на почту ─────────────────────────

async function issueLoginCode(profile: ProfileRow) {
  const admin = adminClient();
  const code = randomCode();
  // Старые неиспользованные коды гасим: действует только последний.
  await admin
    .from('auth_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', profile.id)
    .eq('kind', 'login_code')
    .is('used_at', null);
  const { data, error } = await admin
    .from('auth_tokens')
    .insert({
      kind: 'login_code',
      user_id: profile.id,
      token_hash: sha256(code),
      expires_at: new Date(Date.now() + LOGIN_CODE_TTL_MIN * 60_000).toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`Не удалось создать код входа: ${error.message}`);
  await sendEmail(loginCodeEmail(profile.email, code));
  const store = await cookies();
  store.set(LOGIN_CHALLENGE_COOKIE, data.id, { ...baseCookieOptions, maxAge: LOGIN_CODE_TTL_MIN * 60 });
}

export async function hasPendingChallenge(): Promise<boolean> {
  const store = await cookies();
  return Boolean(store.get(LOGIN_CHALLENGE_COOKIE)?.value);
}

export type CodeResult = { kind: 'ok' } | { kind: 'invalid'; attemptsLeft: number } | { kind: 'expired' };

export async function verifyLoginCode(code: string): Promise<CodeResult> {
  const admin = adminClient();
  const store = await cookies();
  const challengeId = store.get(LOGIN_CHALLENGE_COOKIE)?.value;
  if (!challengeId || !/^[0-9a-f-]{36}$/.test(challengeId)) return { kind: 'expired' };

  const { data: token } = await admin
    .from('auth_tokens')
    .select('id, user_id, token_hash, attempts, expires_at, used_at')
    .eq('id', challengeId)
    .eq('kind', 'login_code')
    .maybeSingle();

  if (!token || token.used_at || new Date(token.expires_at) < new Date() || token.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
    store.delete(LOGIN_CHALLENGE_COOKIE);
    return { kind: 'expired' };
  }

  const profile = await findProfileById(token.user_id);
  if (!profile || !profile.is_active || profile.role !== 'admin') {
    store.delete(LOGIN_CHALLENGE_COOKIE);
    return { kind: 'expired' };
  }

  if (!safeEqualHex(sha256(code), token.token_hash)) {
    const attempts = token.attempts + 1;
    await admin.from('auth_tokens').update({ attempts }).eq('id', token.id);
    await audit({ action: 'auth.login_code_failed', actorId: profile.id, actorEmail: profile.email, actorRole: 'admin' });
    if (attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
      store.delete(LOGIN_CHALLENGE_COOKIE);
      return { kind: 'expired' };
    }
    return { kind: 'invalid', attemptsLeft: LOGIN_CODE_MAX_ATTEMPTS - attempts };
  }

  // Код одноразовый: помечаем использованным условно, чтобы два параллельных запроса не прошли оба.
  const { data: claimed } = await admin
    .from('auth_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', token.id)
    .is('used_at', null)
    .select('id');
  if (!claimed?.length) return { kind: 'expired' };

  // Выдаём сессию без повторного ввода пароля: одноразовая ссылка, сразу подтверждённая сервером.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: profile.email });
  if (linkError || !link.properties?.hashed_token) throw new Error('Не удалось создать сессию');
  const supabase = await createUserClient();
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError || !verified.session) throw new Error('Не удалось создать сессию');

  const sessionId = sessionIdFromJwt(verified.session.access_token);
  if (!sessionId) throw new Error('В токене нет session_id');
  await admin.from('verified_sessions').insert({
    session_id: sessionId,
    user_id: profile.id,
    expires_at: new Date(Date.now() + maxSessionHours() * 3_600_000).toISOString(),
  });

  store.delete(LOGIN_CHALLENGE_COOKIE);
  await markSessionStarted();
  await audit({ action: 'auth.login', actorId: profile.id, actorEmail: profile.email, actorRole: 'admin', details: { second_factor: 'email_code' } });
  return { kind: 'ok' };
}

/** Повторная отправка кода. Не чаще 3 раз за 10 минут. */
export async function resendLoginCode(): Promise<'sent' | 'limited' | 'expired'> {
  const admin = adminClient();
  const store = await cookies();
  const challengeId = store.get(LOGIN_CHALLENGE_COOKIE)?.value;
  if (!challengeId || !/^[0-9a-f-]{36}$/.test(challengeId)) return 'expired';
  const { data: token } = await admin.from('auth_tokens').select('user_id').eq('id', challengeId).maybeSingle();
  if (!token) return 'expired';
  const { data: limited } = await admin.rpc('rate_limit_hit', { p_key: `login_code:${token.user_id}`, p_max: 3, p_window_seconds: 600 });
  if (limited) return 'limited';
  const profile = await findProfileById(token.user_id);
  if (!profile || !profile.is_active || profile.role !== 'admin') return 'expired';
  await issueLoginCode(profile);
  return 'sent';
}

// ───────────────────────── Выход ─────────────────────────

export async function signOut(reason: 'user' | 'idle' | 'denied' | 'expired') {
  const store = await cookies();
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionId = sessionData.session ? sessionIdFromJwt(sessionData.session.access_token) : null;
    if (sessionId) await adminClient().from('verified_sessions').delete().eq('session_id', sessionId);
    await audit({ action: reason === 'user' ? 'auth.logout' : `auth.logout_${reason}`, actorId: data.user.id, actorEmail: data.user.email });
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  for (const name of [ACTIVITY_COOKIE, SESSION_START_COOKIE, LOGIN_CHALLENGE_COOKIE]) store.delete(name);
  // Удаляем cookie сессии Supabase, даже если signOut не дошёл до сервера.
  for (const c of store.getAll()) if (c.name.startsWith('sb-')) store.delete(c.name);
}

// ───────────────────────── Приглашения ─────────────────────────

export interface InvitationInput {
  email: string;
  fullName?: string;
  role: Role;
  companyId: string | null;
  isCompanyLead: boolean;
}

export type InvitationResult = { kind: 'ok' } | { kind: 'exists' } | { kind: 'forbidden' } | { kind: 'error'; message: string };

/**
 * Создать приглашение и отправить письмо. Запись идёт от имени приглашающего (RLS проверяет,
 * что админ может всё, а руководитель клиента — только рядовых коллег в свою компанию).
 */
export async function createInvitation(input: InvitationInput, inviterId: string): Promise<InvitationResult> {
  if (await findProfileByEmail(input.email)) return { kind: 'exists' };

  const token = randomToken();
  const supabase = await createUserClient();
  // Прежние активные приглашения на эту почту отзываем: действует только новая ссылка.
  await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('email', input.email)
    .is('used_at', null)
    .is('revoked_at', null);

  const { error } = await supabase.from('invitations').insert({
    email: input.email,
    full_name: input.fullName || null,
    role: input.role,
    company_id: input.role === 'client' ? input.companyId : null,
    is_company_lead: input.role === 'client' && input.isCompanyLead,
    token_hash: sha256(token),
    invited_by: inviterId,
    expires_at: new Date(Date.now() + INVITATION_TTL_HOURS * 3_600_000).toISOString(),
  });
  if (error) {
    if (error.code === '42501') return { kind: 'forbidden' };
    return { kind: 'error', message: error.message };
  }

  await sendEmail(invitationEmail(input.email, `${env().APP_URL}/invite/${token}`));
  return { kind: 'ok' };
}

interface InvitationRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  company_id: string | null;
  is_company_lead: boolean;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

/** Действующее приглашение по токену из ссылки или null (нет, использовано, отозвано, истекло). */
export async function findValidInvitation(token: string): Promise<InvitationRow | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { data } = await adminClient()
    .from('invitations')
    .select('id, email, full_name, role, company_id, is_company_lead, expires_at, used_at, revoked_at')
    .eq('token_hash', sha256(token))
    .maybeSingle<InvitationRow>();
  if (!data || data.used_at || data.revoked_at || new Date(data.expires_at) < new Date()) return null;
  return data;
}

export type AcceptResult = { kind: 'ok'; role: Role } | { kind: 'invalid' } | { kind: 'error'; message: string };

export async function acceptInvitation(token: string, fullName: string, password: string): Promise<AcceptResult> {
  const admin = adminClient();
  const invitation = await findValidInvitation(token);
  if (!invitation) return { kind: 'invalid' };

  // Занимаем приглашение атомарно: повторный переход по ссылке не создаст второго пользователя.
  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from('invitations')
    .update({ used_at: now })
    .eq('id', invitation.id)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .select('id');
  if (!claimed?.length) return { kind: 'invalid' };

  const release = () => admin.from('invitations').update({ used_at: null }).eq('id', invitation.id);

  if (await findProfileByEmail(invitation.email)) {
    await release();
    return { kind: 'error', message: 'Пользователь с этой почтой уже есть. Войдите или восстановите пароль.' };
  }

  // Переход по ссылке из письма подтверждает почту.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    await release();
    const weak = createError?.code === 'weak_password';
    return { kind: 'error', message: weak ? 'Пароль слишком простой, выберите другой.' : 'Не удалось создать доступ. Попробуйте ещё раз или напишите менеджеру.' };
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    email: invitation.email,
    full_name: fullName,
    role: invitation.role,
    company_id: invitation.company_id,
    is_company_lead: invitation.is_company_lead,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    await release();
    return { kind: 'error', message: 'Не удалось создать доступ. Попробуйте ещё раз или напишите менеджеру.' };
  }

  await audit({
    action: 'auth.invitation_accepted',
    actorId: created.user.id,
    actorEmail: invitation.email,
    actorRole: invitation.role,
    entity: 'invitations',
    entityId: invitation.id,
  });
  return { kind: 'ok', role: invitation.role };
}

// ───────────────────────── Восстановление пароля ─────────────────────────

/**
 * Письмо со ссылкой сброса. Ответ пользователю всегда одинаковый, есть такая почта или нет.
 * Лимиты: 5 запросов за 15 минут с одного IP, 3 письма в час на одну почту.
 */
export async function requestPasswordReset(email: string): Promise<'ok' | 'limited'> {
  const admin = adminClient();
  const { ip } = await requestMeta();
  const { data: ipLimited } = await admin.rpc('rate_limit_hit', { p_key: `forgot:ip:${ip ?? 'unknown'}`, p_max: 5, p_window_seconds: 900 });
  if (ipLimited) return 'limited';

  const profile = await findProfileByEmail(email);
  if (!profile || !profile.is_active) {
    await audit({ action: 'auth.reset_requested_unknown', actorEmail: email });
    return 'ok';
  }
  const { data: emailLimited } = await admin.rpc('rate_limit_hit', { p_key: `forgot:user:${profile.id}`, p_max: 3, p_window_seconds: 3600 });
  if (emailLimited) return 'ok';

  const token = randomToken();
  await admin.from('auth_tokens').insert({
    kind: 'password_reset',
    user_id: profile.id,
    token_hash: sha256(token),
    expires_at: new Date(Date.now() + RESET_TTL_MIN * 60_000).toISOString(),
  });
  await sendEmail(passwordResetEmail(profile.email, `${env().APP_URL}/reset/${token}`));
  await audit({ action: 'auth.reset_requested', actorId: profile.id, actorEmail: profile.email, actorRole: profile.role });
  return 'ok';
}

export async function findValidResetToken(token: string): Promise<{ id: string; userId: string; email: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const admin = adminClient();
  const { data } = await admin
    .from('auth_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('kind', 'password_reset')
    .eq('token_hash', sha256(token))
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return null;
  const profile = await findProfileById(data.user_id);
  if (!profile || !profile.is_active) return null;
  return { id: data.id, userId: data.user_id, email: profile.email };
}

export async function resetPassword(token: string, password: string): Promise<'ok' | 'invalid' | 'error'> {
  const admin = adminClient();
  const found = await findValidResetToken(token);
  if (!found) return 'invalid';
  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from('auth_tokens')
    .update({ used_at: now })
    .eq('id', found.id)
    .is('used_at', null)
    .select('id');
  if (!claimed?.length) return 'invalid';

  const { error } = await admin.auth.admin.updateUserById(found.userId, { password });
  if (error) {
    await admin.from('auth_tokens').update({ used_at: null }).eq('id', found.id);
    return 'error';
  }
  // Остальные ссылки сброса гасим, все открытые сессии закрываем, блокировку входа снимаем.
  await admin.from('auth_tokens').update({ used_at: now }).eq('user_id', found.userId).eq('kind', 'password_reset').is('used_at', null);
  await admin.rpc('revoke_user_sessions', { p_user_id: found.userId });
  await admin.from('login_attempts').insert({ email: found.email, success: true });
  await audit({ action: 'auth.password_reset', actorId: found.userId, actorEmail: found.email });
  return 'ok';
}

// ───────────────────────── Отключение пользователя ─────────────────────────

/** Одно действие админа: доступ закрывается сразу (RLS), сессии отзываются, вход блокируется в Auth. */
export async function setUserActive(userId: string, active: boolean, actorId: string): Promise<'ok' | 'forbidden' | 'error'> {
  if (userId === actorId && !active) return 'forbidden';
  const supabase = await createUserClient();
  const { data, error } = await supabase.from('profiles').update({ is_active: active }).eq('id', userId).select('id, email');
  if (error) return error.code === '42501' ? 'forbidden' : 'error';
  if (!data?.length) return 'forbidden';
  const admin = adminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : '876000h' });
  if (!active) await admin.rpc('revoke_user_sessions', { p_user_id: userId });
  return 'ok';
}
