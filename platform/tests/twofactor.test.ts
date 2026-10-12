// Двухфакторная аутентификация администратора: включение, вход, ограничения, восстановление доступа.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { inject } from 'vitest';
import { admin, Client, enable2fa, lastLink, newAdmin, PASSWORD, secretOf, tokenOf, totp, uniq, inviteClient } from './helpers';

async function adminWithout2fa() {
  const email = uniq('admin-no2fa');
  execFileSync('npx', ['tsx', 'scripts/create-admin.ts', email], { env: { ...process.env, ...JSON.parse(inject('serverEnv')) }, stdio: 'pipe' });
  const c = new Client();
  await c.json('POST', '/api/invitations/accept', { token: tokenOf(lastLink(email, 'invite')), name: 'Админ Без 2FA', password: PASSWORD });
  return { c, email };
}

describe('Включение 2FA', () => {
  it('администратор без 2FA видит только её настройку', async () => {
    const { c } = await adminWithout2fa();
    const r = await c.get('/api/admin/companies');
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe('two_factor_required');
    expect((await c.json('GET', '/api/session/me')).needs2fa).toBe(true);
  });

  it('включение требует пароль и подтверждение кодом; неверный код не включает', async () => {
    const { c } = await adminWithout2fa();
    expect((await c.post('/api/auth/two-factor/enable', { password: 'wrong-password-x' })).status).toBe(400);
    const en = await c.json('POST', '/api/auth/two-factor/enable', { password: PASSWORD });
    expect(en.totpURI).toMatch(/^otpauth:\/\/totp\//);
    expect(en.backupCodes).toHaveLength(10);
    expect((await c.post('/api/auth/two-factor/verify-totp', { code: '000000' })).status).toBe(401);
    expect((await c.get('/api/admin/companies')).status).toBe(403);
    await c.json('POST', '/api/auth/two-factor/verify-totp', { code: totp(secretOf(en.totpURI)) });
    expect((await c.get('/api/admin/companies')).status).toBe(200);
    expect((await c.json('GET', '/api/session/me')).twoFactorEnabled).toBe(true);
  });

  it('секрет и резервные коды хранятся в базе зашифрованными', async () => {
    const a = await admin();
    const { owner } = await import('./helpers');
    const row = await owner(async (db) => (await db.query(`select t.secret, t."backupCodes" from "twoFactor" t join "user" u on u.id = t."userId" where u.email = $1`, [a.email])).rows[0]);
    expect(row.secret).not.toContain(a.secret);
    expect(row.backupCodes).not.toContain(a.backupCodes[0]);
  });

  it('отключить 2FA самостоятельно нельзя', async () => {
    const a = await admin();
    expect((await a.client.post('/api/auth/two-factor/disable', { password: PASSWORD })).status).toBe(404);
  });
});

describe('Вход с 2FA', () => {
  it('после пароля сессии нет, нужен код; верный код открывает кабинет', async () => {
    const a = await admin();
    const c = new Client();
    const r = await c.json('POST', '/api/session/login', { email: a.email, password: PASSWORD });
    expect(r.twoFactor).toBe(true);
    expect((await c.get('/api/session/me')).status).toBe(401);
    expect((await c.get('/api/admin/companies')).status).toBe(401);
    expect((await c.post('/api/auth/two-factor/verify-totp', { code: '123456' })).status).toBe(401);
    const ok = await c.req('POST', '/api/auth/two-factor/verify-totp', { code: totp(a.secret), trustDevice: true });
    expect(ok.status).toBe(200);
    expect(ok.headers.getSetCookie().some((x) => /trust_device/i.test(x) && !/max-age=0/i.test(x))).toBe(false);
    expect((await c.get('/api/admin/companies')).status).toBe(200);
    // «Доверенное устройство» не сработало: следующий вход снова требует код
    expect((await c.json('POST', '/api/session/login', { email: a.email, password: PASSWORD })).twoFactor).toBe(true);
  });

  it('без cookie первого шага код не принимается', async () => {
    const a = await admin();
    expect((await new Client().post('/api/auth/two-factor/verify-totp', { code: totp(a.secret) })).status).toBe(401);
  });

  it('после серии неверных кодов вход блокируется даже с верным кодом', async () => {
    const a = await newAdmin();
    const c = new Client();
    await c.json('POST', '/api/session/login', { email: a.email, password: PASSWORD });
    for (let i = 0; i < 6; i++) await c.post('/api/auth/two-factor/verify-totp', { code: String(100000 + i) });
    expect((await c.post('/api/auth/two-factor/verify-totp', { code: totp(a.secret) })).status).not.toBe(200);
    expect((await c.get('/api/session/me')).status).toBe(401);
  });

  it('резервный код работает один раз', async () => {
    const a = await newAdmin();
    const c1 = new Client();
    await c1.json('POST', '/api/session/login', { email: a.email, password: PASSWORD });
    await c1.json('POST', '/api/auth/two-factor/verify-backup-code', { code: a.backupCodes[0] });
    expect((await c1.get('/api/admin/companies')).status).toBe(200);
    const c2 = new Client();
    await c2.json('POST', '/api/session/login', { email: a.email, password: PASSWORD });
    expect((await c2.post('/api/auth/two-factor/verify-backup-code', { code: a.backupCodes[0] })).status).not.toBe(200);
  });
});

describe('Восстановление доступа', () => {
  it('сброс пароля не отключает 2FA', async () => {
    const a = await newAdmin();
    await new Client().post('/api/auth/request-password-reset', { email: a.email });
    const token = tokenOf(lastLink(a.email, 'reset-password'));
    await new Client().json('POST', '/api/auth/reset-password', { token, newPassword: 'new-admin-password-1' });
    const c = new Client();
    expect((await c.json('POST', '/api/session/login', { email: a.email, password: 'new-admin-password-1' })).twoFactor).toBe(true);
    await c.json('POST', '/api/auth/two-factor/verify-totp', { code: totp(a.secret) });
    expect((await c.get('/api/admin/companies')).status).toBe(200);
  });

  it('другой администратор сбрасывает 2FA: сессии закрыты, при входе 2FA настраивается заново', async () => {
    const lead = await admin();
    const lost = await newAdmin();
    const users = await lead.client.json('GET', '/api/admin/users');
    const u = users.find((x: any) => x.email === lost.email);
    expect(u.two_factor_enabled).toBe(true);
    expect((await lost.client.post(`/api/admin/users/${u.id}/reset-2fa`)).status).toBe(400);   // себе нельзя
    await lead.client.json('POST', `/api/admin/users/${u.id}/reset-2fa`);
    expect((await lost.client.get('/api/session/me')).status).toBe(401);
    const c = new Client();
    const r = await c.json('POST', '/api/session/login', { email: lost.email, password: PASSWORD });
    expect(r.twoFactor).toBeUndefined();
    expect((await c.get('/api/admin/companies')).status).toBe(403);
    await enable2fa(c);
    expect((await c.get('/api/admin/companies')).status).toBe(200);
    const log = await lead.client.json('GET', '/api/admin/audit?action=2fa.reset');
    expect(log.some((e: any) => e.entity_id === u.id)).toBe(true);
  });

  it('аварийный сброс из консоли сервера', async () => {
    const a = await newAdmin();
    execFileSync('npx', ['tsx', 'scripts/reset-2fa.ts', a.email], { env: { ...process.env, ...JSON.parse(inject('serverEnv')) }, stdio: 'pipe' });
    expect((await a.client.get('/api/session/me')).status).toBe(401);
    const c = new Client();
    expect((await c.json('POST', '/api/session/login', { email: a.email, password: PASSWORD })).twoFactor).toBeUndefined();
    expect((await c.json('GET', '/api/session/me')).needs2fa).toBe(true);
  });

  it('клиент не может сбрасывать 2FA', async () => {
    const lead = await admin();
    const co = await lead.client.json('POST', '/api/admin/companies', { name: 'Компания 2FA' });
    const cl = await inviteClient(lead.client, co.id);
    const users = await lead.client.json('GET', '/api/admin/users');
    const target = users.find((x: any) => x.email === lead.email);
    expect((await cl.client.post(`/api/admin/users/${target.id}/reset-2fa`)).status).toBe(403);
  });
});
