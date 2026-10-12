// Сессии: подпись cookie, смена пароля, выход на всех устройствах, отзыв администратором.
import { describe, expect, it } from 'vitest';
import { admin, Client, inviteClient, owner, PASSWORD } from './helpers';

async function clientUser(name = 'Сессии') {
  const { client: adm } = await admin();
  const co = await adm.json('POST', '/api/admin/companies', { name: `Компания ${name}` });
  return inviteClient(adm, co.id);
}
const cookieName = (c: Client) => [...c.cookies.keys()].find((k) => k.includes('session_token'))!;

describe('Сессии', () => {
  it('токен из базы без подписи сервера не работает: подделать cookie по утечке базы нельзя', async () => {
    const u = await clientUser('подпись');
    const token = await owner(async (db) => (await db.query(`select s.token from session s join "user" x on x.id = s."userId" where x.email = $1 order by s."createdAt" desc limit 1`, [u.email])).rows[0].token);
    const name = cookieName(u.client);
    for (const value of [token, `${token}.${'A'.repeat(43)}=`, encodeURIComponent(`${token}.invalidsignature`)]) {
      const f = new Client(); f.cookies.set(name, value);
      expect((await f.get('/api/session/me')).status).toBe(401);
    }
    expect((await u.client.get('/api/session/me')).status).toBe(200);
  });

  it('смена пароля: проверка текущего, остальные сессии закрываются, текущая продолжается', async () => {
    const u = await clientUser('смена');
    const other = new Client();
    expect((await other.login(u.email, PASSWORD)).status).toBe(200);
    expect((await u.client.post('/api/session/change-password', { currentPassword: 'wrong-password-1', newPassword: 'another-password-1' })).status).toBe(400);
    await u.client.json('POST', '/api/session/change-password', { currentPassword: PASSWORD, newPassword: 'another-password-1' });
    expect((await other.get('/api/session/me')).status).toBe(401);
    expect((await u.client.get('/api/session/me')).status).toBe(200);
    expect((await new Client().login(u.email, PASSWORD)).status).toBe(401);
    expect((await new Client().login(u.email, 'another-password-1')).status).toBe(200);
  });

  it('выход на всех устройствах закрывает все сессии', async () => {
    const u = await clientUser('все');
    const second = new Client();
    await second.login(u.email, PASSWORD);
    await u.client.json('POST', '/api/session/logout-all');
    expect((await u.client.get('/api/session/me')).status).toBe(401);
    expect((await second.get('/api/session/me')).status).toBe(401);
  });

  it('администратор завершает все сессии пользователя', async () => {
    const { client: adm } = await admin();
    const u = await clientUser('отзыв');
    const users = await adm.json('GET', '/api/admin/users');
    const id = users.find((x: any) => x.email === u.email).id;
    expect(users.find((x: any) => x.email === u.email).active_sessions).toBeGreaterThan(0);
    await adm.json('DELETE', `/api/admin/users/${id}/sessions`);
    expect((await u.client.get('/api/session/me')).status).toBe(401);
    expect((await new Client().login(u.email, PASSWORD)).status).toBe(200);   // пароль не меняется, вход возможен
  });

  it('истёкшая сессия не продлевается запросом', async () => {
    const u = await clientUser('истечение');
    await owner((db) => db.query(`update session set "expiresAt" = now() - interval '1 second' where "userId" = (select id from "user" where email = $1)`, [u.email]));
    expect((await u.client.get('/api/session/me')).status).toBe(401);
    expect((await u.client.get('/api/session/me')).status).toBe(401);
  });
});
