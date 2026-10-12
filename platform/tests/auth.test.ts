import { describe, expect, it } from 'vitest';
import { admin, Client, lastLink, mails, owner, PASSWORD, tokenOf, uniq, inviteClient } from './helpers';

describe('Вход и приглашения', () => {
  it('открытая регистрация и прямой вход Better Auth закрыты', async () => {
    const c = new Client();
    expect((await c.post('/api/auth/sign-up/email', { email: uniq('x'), password: 'abcdefghijkl', name: 'X' })).status).toBe(404);
    expect((await c.post('/api/auth/sign-in/email', { email: uniq('x'), password: 'abcdefghijkl' })).status).toBe(404);
  });

  it('первый администратор входит только по ссылке из приглашения, пароль задаёт сам', async () => {
    const { client, email } = await admin();
    const me = await client.json('GET', '/api/session/me');
    expect(me.kind).toBe('admin');
    expect(me.user.email).toBe(email);
  });

  it('токен приглашения одноразовый и хранится в базе только в виде хэша', async () => {
    const { client: adm } = await admin();
    const co = await adm.json('POST', '/api/admin/companies', { name: 'Компания приглашений' });
    const email = uniq('inv');
    await adm.json('POST', '/api/admin/invitations', { email, company_id: co.id, member_role: 'owner' });
    const token = tokenOf(lastLink(email, 'invite'));
    const stored = await owner(async (db) => (await db.query('select token_hash from invitations where email = $1', [email])).rows[0].token_hash);
    expect(stored).not.toContain(token);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    const c = new Client();
    await c.json('POST', '/api/invitations/accept', { token, name: 'Клиент Один', password: PASSWORD });
    expect((await c.json('GET', '/api/session/me')).kind).toBe('client');
    const again = await new Client().post('/api/invitations/accept', { token, name: 'Повтор', password: PASSWORD });
    expect(again.status).toBe(400);
  });

  it('просроченное и отозванное приглашение не работает', async () => {
    const { client: adm } = await admin();
    const co = await adm.json('POST', '/api/admin/companies', { name: 'Компания сроков' });
    const e1 = uniq('exp'), e2 = uniq('rev');
    await adm.json('POST', '/api/admin/invitations', { email: e1, company_id: co.id });
    const inv2 = await adm.json('POST', '/api/admin/invitations', { email: e2, company_id: co.id });
    await owner((db) => db.query(`update invitations set expires_at = now() - interval '1 minute' where email = $1`, [e1]));
    await adm.json('POST', `/api/admin/invitations/${inv2.id}/revoke`);
    for (const e of [e1, e2]) {
      const t = tokenOf(lastLink(e, 'invite'));
      expect((await new Client().get(`/api/invitations/${t}`)).status).toBe(404);
      expect((await new Client().post('/api/invitations/accept', { token: t, name: 'Имя', password: PASSWORD })).status).toBe(400);
    }
  });

  it('пароль короче 10 символов не принимается', async () => {
    const { client: adm } = await admin();
    const co = await adm.json('POST', '/api/admin/companies', { name: 'Компания паролей' });
    const e = uniq('short');
    await adm.json('POST', '/api/admin/invitations', { email: e, company_id: co.id });
    const r = await new Client().post('/api/invitations/accept', { token: tokenOf(lastLink(e, 'invite')), name: 'Имя', password: 'short' });
    expect(r.status).toBe(400);
  });

  it('cookie сессии: HttpOnly, SameSite=Lax; выход закрывает сессию', async () => {
    const { client: adm } = await admin();
    const co = await adm.json('POST', '/api/admin/companies', { name: 'Компания cookie' });
    const { email } = await inviteClient(adm, co.id);
    const c = new Client();
    const r = await c.login(email, PASSWORD);
    expect(r.status).toBe(200);
    const cookie = r.headers.getSetCookie().find((x) => x.includes('session_token'))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const saved = new Map(c.cookies);
    await c.json('POST', '/api/session/logout');
    const replay = new Client(); replay.cookies = saved;
    expect((await replay.get('/api/session/me')).status).toBe(401);
  });

  it('изменяющий запрос с чужого адреса отклоняется', async () => {
    const { client: adm } = await admin();
    const r = await adm.req('POST', '/api/admin/companies', { name: 'Чужой' }, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });
});

describe('Ограничение попыток входа', () => {
  it('после 5 неверных паролей вход блокируется на 15 минут даже с верным паролем', async () => {
    const { client: adm } = await admin();
    const co = await adm.json('POST', '/api/admin/companies', { name: 'Компания попыток' });
    const { email } = await inviteClient(adm, co.id);
    const c = new Client();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await c.login(email, 'wrong-password-' + i)).status);
    expect(statuses.slice(0, 4)).toEqual([401, 401, 401, 401]);
    expect(statuses[4]).toBe(429);
    expect((await c.login(email, PASSWORD)).status).toBe(429);
    expect((await new Client().login(email, PASSWORD)).status).toBe(429);   // с другого IP тоже: ограничение по почте
  });

  it('для несуществующей почты ответы такие же, как для существующей', async () => {
    const c = new Client();
    const email = uniq('nobody');
    const first = await c.login(email, 'whatever-password');
    expect(first.status).toBe(401);
    expect((await first.json()).message).toBe('Неверная почта или пароль');
    for (let i = 0; i < 3; i++) await c.login(email, 'whatever-password');
    expect((await c.login(email, 'whatever-password')).status).toBe(429);
  });

  it('ограничение по IP: 30 неудачных попыток с одного адреса блокируют этот адрес', async () => {
    const c = new Client();
    let last = 0;
    for (let i = 0; i < 30; i++) last = (await c.login(uniq('spray'), 'password-' + i)).status;
    expect(last).toBe(429);
    const { client: adm, email } = await admin();
    void adm;
    expect((await c.login(email, PASSWORD)).status).toBe(429);
  });
});

describe('Восстановление пароля', () => {
  it('ссылка приходит письмом, токен в базе хэширован, после смены пароля старые сессии закрыты', async () => {
    const { client: adm } = await admin();
    const co = await adm.json('POST', '/api/admin/companies', { name: 'Компания сброса' });
    const { client: old, email } = await inviteClient(adm, co.id);
    const r = await new Client().post('/api/auth/request-password-reset', { email });
    expect(r.status).toBe(200);
    const token = tokenOf(lastLink(email, 'reset-password'));
    const raw = await owner(async (db) => (await db.query(`select count(*)::int as n from verification where identifier like '%' || $1 || '%' or value = $1`, [token])).rows[0].n);
    expect(raw).toBe(0);
    const done = await new Client().post('/api/auth/reset-password', { token, newPassword: 'new-password-12345' });
    expect(done.status).toBe(200);
    expect((await old.get('/api/session/me')).status).toBe(401);
    expect((await new Client().login(email, PASSWORD)).status).toBe(401);
    expect((await new Client().login(email, 'new-password-12345')).status).toBe(200);
    expect((await new Client().post('/api/auth/reset-password', { token, newPassword: 'another-password-1' })).status).toBe(400);
  });

  it('для неизвестной почты ответ тот же, письмо не отправляется', async () => {
    const email = uniq('unknown');
    const r = await new Client().post('/api/auth/request-password-reset', { email });
    expect(r.status).toBe(200);
    expect(mails(email)).toHaveLength(0);
  });
});

describe('Отзыв доступа', () => {
  it('блокировка закрывает действующую сессию сразу и не даёт войти', async () => {
    const { client: adm } = await admin();
    const co = await adm.json('POST', '/api/admin/companies', { name: 'Компания блокировки' });
    const { client: c, email } = await inviteClient(adm, co.id);
    const users = await adm.json('GET', '/api/admin/users');
    const u = users.find((x: any) => x.email === email);
    await adm.json('POST', `/api/admin/users/${u.id}/block`, { blocked: true, reason: 'тест' });
    expect((await c.get('/api/session/me')).status).toBe(401);
    expect((await new Client().login(email, PASSWORD)).status).toBe(401);
    const before = mails(email).length;
    await new Client().post('/api/auth/request-password-reset', { email });
    expect(mails(email).length).toBe(before);
    await adm.json('POST', `/api/admin/users/${u.id}/block`, { blocked: false });
    expect((await new Client().login(email, PASSWORD)).status).toBe(200);
  });

  it('сессия без активности дольше срока и сессия старше 12 часов недействительны', async () => {
    const { client: adm } = await admin();
    const co = await adm.json('POST', '/api/admin/companies', { name: 'Компания сроков сессии' });
    const one = await inviteClient(adm, co.id);
    const two = await inviteClient(adm, co.id);
    const id = async (email: string) => owner(async (db) => (await db.query('select id from "user" where email = $1', [email])).rows[0].id);
    await owner(async (db) => db.query(`update session set "expiresAt" = now() - interval '1 minute' where "userId" = $1`, [await id(one.email)]));
    await owner(async (db) => db.query(`update session set "createdAt" = now() - interval '13 hours' where "userId" = $1`, [await id(two.email)]));
    expect((await one.client.get('/api/session/me')).status).toBe(401);
    expect((await two.client.get('/api/session/me')).status).toBe(401);
  });
});
