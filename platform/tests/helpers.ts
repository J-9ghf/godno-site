import { inject } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

export const base = () => inject('baseUrl');
const rndIp = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;

// HTTP-клиент с собственными cookie и IP (сервер в тестах доверяет X-Real-IP)
export class Client {
  cookies = new Map<string, string>();
  constructor(public ip = rndIp()) {}
  private headers(extra: Record<string, string> = {}) {
    const h: Record<string, string> = { origin: base(), 'x-real-ip': this.ip, ...extra };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    return h;
  }
  private keep(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';'); const i = pair.indexOf('=');
      const name = pair.slice(0, i), value = pair.slice(i + 1);
      if (!value || /max-age=0/i.test(c)) this.cookies.delete(name); else this.cookies.set(name, value);
    }
    return res;
  }
  async req(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const init: RequestInit = { method, headers: this.headers(body !== undefined ? { 'content-type': 'application/json', ...extra } : extra), redirect: 'manual' };
    if (body !== undefined) init.body = JSON.stringify(body);
    return this.keep(await fetch(base() + path, init));
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b: unknown = {}) => this.req('POST', p, b);
  patch = (p: string, b: unknown) => this.req('PATCH', p, b);
  del = (p: string) => this.req('DELETE', p);
  async json(method: string, path: string, body?: unknown, expect = 200) {
    const r = await this.req(method, path, body);
    const text = await r.text();
    if (r.status !== expect) throw new Error(`${method} ${path}: ожидали ${expect}, получили ${r.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  }
  async upload(path: string, data: Buffer, name: string, kind = 'resume_pdf', mime = 'application/pdf') {
    const fd = new FormData();
    fd.set('kind', kind);
    fd.set('file', new Blob([new Uint8Array(data)], { type: mime }), name);
    return this.keep(await fetch(base() + path, { method: 'POST', headers: this.headers(), body: fd }));
  }
  async login(email: string, password: string) { return this.post('/api/session/login', { email, password }); }
}

export function mails(to: string) {
  const dir = inject('mailDir');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))).filter((m) => m.to === to.toLowerCase());
}
export function lastLink(to: string, kind: 'invite' | 'reset-password') {
  const m = mails(to).reverse().find((x) => x.text.includes(`/${kind}`));
  if (!m) throw new Error('Письмо не найдено для ' + to);
  return m.text.match(new RegExp(`https?://\\S+/${kind}[^\\s]*`))![0];
}
export const tokenOf = (link: string) => link.includes('/invite/') ? link.split('/invite/')[1] : new URL(link).searchParams.get('token')!;

export const PASSWORD = 'correct-horse-battery';
export const uniq = (p: string) => `${p}-${randomBytes(3).toString('hex')}@example.test`;

export async function owner<T>(fn: (c: pg.Client) => Promise<T>) {
  const c = new pg.Client({ connectionString: inject('ownerUrl') }); await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
export async function asApp<T>(userId: string | null, fn: (c: pg.Client) => Promise<T>) {
  const c = new pg.Client({ connectionString: inject('appUrl') }); await c.connect();
  try {
    await c.query('begin'); await c.query("select set_config('app.user_id', $1, true)", [userId ?? '']);
    const r = await fn(c); await c.query('rollback'); return r;
  } finally { await c.end(); }
}

// TOTP по RFC 6238 (SHA-1, 30 секунд, 6 цифр) — как в приложениях-аутентификаторах
function base32(s: string) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, val = 0; const out: number[] = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) { val = (val << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function totp(secret: string, at = Date.now()) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac('sha1', base32(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
export const secretOf = (uri: string) => new URL(uri).searchParams.get('secret')!;

// Включение 2FA для вошедшего пользователя: возвращает секрет и резервные коды
export async function enable2fa(c: Client, password = PASSWORD) {
  const en = await c.json('POST', '/api/auth/two-factor/enable', { password });
  const secret = secretOf(en.totpURI);
  await c.json('POST', '/api/auth/two-factor/verify-totp', { code: totp(secret) });
  return { secret, backupCodes: en.backupCodes as string[] };
}

// Новый администратор: приглашение из консоли, пароль, обязательная 2FA
export async function newAdmin() {
  const email = uniq('admin');
  execFileSync('npx', ['tsx', 'scripts/create-admin.ts', email], { env: { ...process.env, ...JSON.parse(inject('serverEnv')) }, stdio: 'pipe' });
  const client = new Client();
  await client.json('POST', '/api/invitations/accept', { token: tokenOf(lastLink(email, 'invite')), name: 'Админ Тестовый', password: PASSWORD });
  const tf = await enable2fa(client);
  return { client, email, ...tf };
}

let adminCache: Awaited<ReturnType<typeof newAdmin>> | null = null;
export async function admin() {
  if (!adminCache) adminCache = await newAdmin();
  return adminCache;
}

export async function inviteClient(adm: Client, companyId: string, role: 'owner' | 'member' | 'viewer' = 'member', name = 'Клиент Тестовый') {
  const email = uniq('client');
  await adm.json('POST', '/api/admin/invitations', { email, company_id: companyId, member_role: role });
  const c = new Client();
  await c.json('POST', '/api/invitations/accept', { token: tokenOf(lastLink(email, 'invite')), name, password: PASSWORD });
  return { client: c, email };
}

// Минимальный корректный PDF из одной страницы (вымышленный документ, без персональных данных)
export function makePdf(title = 'Test') {
  const content = `BT /F1 12 Tf 20 100 Td (${title}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n'; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export const fakeId = () => randomUUID();
