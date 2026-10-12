// Тестовое окружение: временная PostgreSQL, миграции, сборка и запуск сервера.
// Никаких внешних сервисов: письма пишутся в папку, файлы хранятся во временной папке.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, chownSync, existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { TestProject } from 'vitest/node';
import { migrate } from '../scripts/migrate';

const freePort = () => new Promise<number>((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => res(p)); }); });
const pgBin = () => { const base = '/usr/lib/postgresql'; const v = existsSync(base) ? readdirSync(base).sort().pop() : null; return v ? join(base, v, 'bin') : ''; };
const asPg = (cmd: string, args: string[]) => process.getuid?.() === 0 ? ['runuser', ['-u', 'postgres', '--', cmd, ...args]] as const : [cmd, args] as const;

let server: ChildProcess | null = null;
let tmp = '';
let pgData = '';

export default async function setup(project: TestProject) {
  tmp = mkdtempSync(join(tmpdir(), 'ikr-test-'));
  if (process.getuid?.() === 0) { const uid = Number(execFileSync('id', ['-u', 'postgres']).toString()); const gid = Number(execFileSync('id', ['-g', 'postgres']).toString()); chownSync(tmp, uid, gid); }
  pgData = join(tmp, 'pg');
  const bin = pgBin();
  const pgPort = await freePort();
  const run = (cmd: string, args: string[]) => { const [c, a] = asPg(join(bin, cmd), args); execFileSync(c, a as string[], { stdio: 'pipe' }); };
  run('initdb', ['-D', pgData, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C.UTF-8']);
  run('pg_ctl', ['-D', pgData, '-o', `-p ${pgPort} -k ${tmp} -c listen_addresses=127.0.0.1`, '-l', join(pgData, 'log'), '-w', 'start']);
  execFileSync('psql', ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1',
    '-v', `owner_password=${randomBytes(24).toString('hex')}`, '-v', `app_password=${randomBytes(24).toString('hex')}`, '-f', 'db/bootstrap.sql'], { stdio: 'pipe' });
  const ownerUrl = `postgres://ikr_owner@127.0.0.1:${pgPort}/ikr`;
  const appUrl = `postgres://ikr_app@127.0.0.1:${pgPort}/ikr`;
  await migrate(ownerUrl, () => {});

  execFileSync('npx', ['astro', 'build'], { stdio: 'pipe' });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), BASE_URL: baseUrl,
    DATABASE_URL: appUrl, BETTER_AUTH_SECRET: randomBytes(48).toString('base64'),
    TRUST_PROXY: 'true', MAIL_TRANSPORT: 'file', MAIL_DIR: join(tmp, 'mail'),
    STORAGE_DRIVER: 'local', STORAGE_LOCAL_DIR: join(tmp, 'files'),
    FILE_SCAN_MODE: 'off', ADMIN_2FA_REQUIRED: 'true',
  };
  server = spawn('node', ['dist/server/entry.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout!.on('data', (d) => (log += d)); server.stderr!.on('data', (d) => (log += d));
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(baseUrl + '/login')).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
    if (i === 99) throw new Error('Сервер не запустился:\n' + log);
  }
  project.provide('baseUrl', baseUrl);
  project.provide('ownerUrl', ownerUrl);
  project.provide('appUrl', appUrl);
  project.provide('mailDir', env.MAIL_DIR);
  project.provide('filesDir', env.STORAGE_LOCAL_DIR);
  project.provide('serverEnv', JSON.stringify({ BASE_URL: baseUrl, DATABASE_URL: appUrl, BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET, MAIL_TRANSPORT: 'file', MAIL_DIR: env.MAIL_DIR, FILE_SCAN_MODE: 'off', STORAGE_LOCAL_DIR: env.STORAGE_LOCAL_DIR }));
  (globalThis as any).__serverLog = () => log;

  return async () => {
    if (process.env.SHOW_SERVER_LOG) console.log('--- server log ---\n' + log);
    server?.kill();
    try { const [c, a] = asPg(join(bin, 'pg_ctl'), ['-D', pgData, '-w', 'stop', '-m', 'fast']); execFileSync(c, a as string[], { stdio: 'pipe' }); } catch {}
    rmSync(tmp, { recursive: true, force: true });
  };
}

declare module 'vitest' {
  export interface ProvidedContext { baseUrl: string; ownerUrl: string; appUrl: string; mailDir: string; filesDir: string; serverEnv: string }
}
