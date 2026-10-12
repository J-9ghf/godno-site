// Конфигурация сессий перед запуском: атрибуты cookie в рабочем режиме (HTTPS), защита от CSRF,
// последствия утечки ключа сервера и ротация ключа без потери 2FA.
import { describe, expect, it, afterAll } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inject } from 'vitest';
import { admin, Client, enable2fa, lastLink, newAdmin, owner, PASSWORD, startServer, tokenOf, totp, uniq } from './helpers';

const serverEnv = () => JSON.parse(inject('serverEnv')) as Record<string, string>;
const stops: (() => Promise<void>)[] = [];
afterAll(async () => { for (const s of stops) await s(); });

// Подпись cookie так же, как это делает Better Auth (HMAC-SHA256 ключом сервера)
const sign = (value: string, secret: string) => encodeURIComponent(`${value}.${createHmac('sha256', secret).update(value).digest('base64')}`);
const latestToken = (email: string) => owner(async (db) => (await db.query(`select s.token from session s join "user" u on u.id = s."userId" where u.email = $1 order by s."createdAt" desc limit 1`, [email])).rows[0].token as string);
async function login2fa(c: Client, email: string, secret: string) {
  expect((await c.json('POST', '/api/session/login', { email, password: PASSWORD })).twoFactor).toBe(true);
  return c.req('POST', '/api/auth/two-factor/verify-totp', { code: totp(secret) });
}
// Клиент дополнительного сервера (у него свой адрес сайта)
const at = (url: string) => new Client(undefined, url);
const attrs = (cookie: string) => cookie.split(';').slice(1).map((x) => x.trim().toLowerCase());

describe('cookie в рабочем режиме (HTTPS)', () => {
  it('сессия и промежуточная cookie 2FA: __Secure-, Secure, HttpOnly, SameSite=Lax, срок = время бездействия', async () => {
    const origin = 'https://kabinet.ikr.test';
    const srv = await startServer({ BASE_URL: origin });
    stops.push(srv.stop);
    const a = await admin();
    const c = new Client(undefined, srv.url, origin);
    const r1 = await c.req('POST', '/api/session/login', { email: a.email, password: PASSWORD });
    const r2 = await c.req('POST', '/api/auth/two-factor/verify-totp', { code: totp(a.secret) });
    expect(r2.status).toBe(200);
    const set = [...r1.headers.getSetCookie(), ...r2.headers.getSetCookie()].filter((x) => !/max-age=0/i.test(x));
    const session = set.find((x) => x.startsWith('__Secure-ikr.session_token='));
    expect(session, set.join('\n')).toBeTruthy();
    expect(set.some((x) => /two_factor/.test(x))).toBe(true);
    for (const ck of set) {
      const at = attrs(ck);
      expect(ck.startsWith('__Secure-ikr.'), ck).toBe(true);
      expect(at).toContain('secure');
      expect(at).toContain('httponly');
      expect(at).toContain('samesite=lax');
      expect(at).toContain('path=/');
      expect(at.some((x) => x.startsWith('domain='))).toBe(false); // только этот адрес, без поддоменов
    }
    expect(attrs(session!)).toContain('max-age=1800');
    expect(attrs(set.find((x) => /two_factor/.test(x))!)).toContain('max-age=600');
    expect((await c.get('/api/session/me')).status).toBe(200);
    // HSTS и запрет встраивания страниц
    const page = await fetch(srv.url + '/login');
    expect(page.headers.get('strict-transport-security')).toMatch(/max-age=\d{7,}/);
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('в рабочем режиме сервер не стартует с адресом без HTTPS и без ключа', async () => {
    await expect(startServer({ BASE_URL: 'http://kabinet.ikr.test' })).rejects.toThrow(/https/);
    await expect(startServer({ BETTER_AUTH_SECRET: undefined })).rejects.toThrow(/BETTER_AUTH_SECRET/);
    await expect(startServer({ BETTER_AUTH_SECRETS: '1:short' })).rejects.toThrow(/BETTER_AUTH_SECRETS/);
  });
});

describe('CSRF', () => {
  it('изменяющие запросы без Origin или с чужим Origin отклоняются до обработки', async () => {
    const a = await admin();
    const cookie = [...a.client.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const before = await owner(async (db) => (await db.query('select count(*)::int n from companies')).rows[0].n);
    for (const origin of [undefined, 'https://evil.example', 'null', inject('baseUrl') + '.evil.example']) {
      const h: Record<string, string> = { cookie, 'content-type': 'application/json' };
      if (origin) h.origin = origin;
      for (const [path, body] of [['/api/admin/companies', { name: 'CSRF' }], ['/api/session/logout-all', {}], ['/api/auth/sign-out', {}], ['/api/session/login', { email: a.email, password: PASSWORD }]] as const) {
        const r = await fetch(inject('baseUrl') + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
        expect(r.status, `${path} ${origin}`).toBe(403);
      }
      // Форма с другого сайта (text/plain) тоже не проходит
      const f = await fetch(inject('baseUrl') + '/api/admin/companies', { method: 'POST', headers: { cookie, ...(origin ? { origin } : {}), 'content-type': 'text/plain' }, body: '{"name":"CSRF"}' });
      expect(f.status).toBe(403);
    }
    expect(await owner(async (db) => (await db.query('select count(*)::int n from companies')).rows[0].n)).toBe(before);
    expect((await a.client.get('/api/session/me')).status).toBe(200); // сессия не закрыта чужими запросами
  });

  it('GET не меняет состояние: выход и действия доступны только методом POST', async () => {
    const a = await admin();
    for (const p of ['/api/auth/sign-out', '/api/session/logout', '/api/session/logout-all']) expect([404, 405]).toContain((await a.client.get(p)).status);
    expect((await a.client.get('/api/session/me')).status).toBe(200);
  });
});

describe('утечка и ротация ключа сервера', () => {
  const A = () => serverEnv().BETTER_AUTH_SECRET;
  const B = randomBytes(48).toString('base64');
  const C = randomBytes(48).toString('base64');

  it('утечка базы и ключа вместе позволяет подделать cookie действующей сессии; после смены ключа подделка не работает', async () => {
    const a = await newAdmin();
    const token = await latestToken(a.email);
    const name = [...a.client.cookies.keys()].find((k) => k.includes('session_token'))!;
    const forged = new Client(); forged.cookies.set(name, sign(token, A()));
    expect((await forged.get('/api/session/me')).status).toBe(200); // именно поэтому ключ хранится отдельно от базы и копий
    const srv = await startServer({ BETTER_AUTH_SECRETS: `2:${B}` });
    stops.push(srv.stop);
    const f2 = at(srv.url); f2.cookies.set(name, sign(token, A()));
    expect((await f2.get('/api/session/me')).status).toBe(401);
  });

  it('плановая ротация: все выходят, 2FA продолжает работать; после удаления старого ключа её нужно настроить заново', async () => {
    const old = await newAdmin(); // 2FA зашифрована старым ключом без версии
    const srv2 = await startServer({ BETTER_AUTH_SECRETS: `2:${B}` }); // BETTER_AUTH_SECRET = старый ключ для расшифровки
    stops.push(srv2.stop);
    // Действующие cookie, подписанные старым ключом, больше не принимаются
    const name = [...old.client.cookies.keys()].find((k) => k.includes('session_token'))!;
    const stale = at(srv2.url); stale.cookies.set(name, old.client.cookies.get(name)!);
    expect((await stale.get('/api/session/me')).status).toBe(401);
    // Вход с кодом 2FA, зашифрованной старым ключом, работает
    const c2 = at(srv2.url);
    expect((await login2fa(c2, old.email, old.secret)).status).toBe(200);
    expect((await c2.get('/api/admin/companies')).status).toBe(200);

    // Новый администратор настраивает 2FA уже на ключе версии 2
    const email = uniq('admin-rot');
    execFileSync('npx', ['tsx', 'scripts/create-admin.ts', email], { env: { ...process.env, ...serverEnv() }, stdio: 'pipe' });
    const fresh = at(srv2.url);
    await fresh.json('POST', '/api/invitations/accept', { token: tokenOf(lastLink(email, 'invite')), name: 'Админ Ротация', password: PASSWORD });
    const tf = await enable2fa(fresh);

    // Следующая ротация без старого ключа без версии: 2FA на ключе версии 2 работает, на старом — нет
    const srv3 = await startServer({ BETTER_AUTH_SECRETS: `3:${C},2:${B}`, BETTER_AUTH_SECRET: undefined });
    stops.push(srv3.stop);
    expect((await login2fa(at(srv3.url), email, tf.secret)).status).toBe(200);
    const broken = at(srv3.url);
    expect((await login2fa(broken, old.email, old.secret)).status).not.toBe(200);
    expect((await broken.get('/api/session/me')).status).toBe(401);
    // Восстановление: сброс 2FA (консоль или другой администратор) и настройка заново
    execFileSync('npx', ['tsx', 'scripts/reset-2fa.ts', old.email], { env: { ...process.env, ...serverEnv() }, stdio: 'pipe' });
    const again = at(srv3.url);
    expect((await again.json('POST', '/api/session/login', { email: old.email, password: PASSWORD })).twoFactor).toBeFalsy();
    expect((await again.json('GET', '/api/session/me')).needs2fa).toBe(true);
    const tf2 = await enable2fa(again);
    expect((await login2fa(at(srv3.url), old.email, tf2.secret)).status).toBe(200);
  });
});
