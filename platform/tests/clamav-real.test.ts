// Проверка с настоящим ClamAV (clamd). Запуск: CLAMAV_TEST_HOST=127.0.0.1 CLAMAV_TEST_PORT=3310 npm test
// Нужны сигнатуры, которые ловят тестовую строку EICAR и маркер IKR-MALWARE-TEST-MARKER-7f3a
// (официальные базы ClamAV ловят EICAR; маркер добавляется своей тестовой сигнатурой, см. docs/platform/clamav.md).
// CLAMAV_TEST_SMALL_PORT — необязательный второй clamd с StreamMaxLength 1M для проверки превышения лимита.
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inject } from 'vitest';
import { admin, Client, makePdf, owner, startServer } from './helpers';

const HOST = process.env.CLAMAV_TEST_HOST;
const PORT = process.env.CLAMAV_TEST_PORT ?? '3310';
const SMALL = process.env.CLAMAV_TEST_SMALL_PORT;
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const storedCount = () => { const d = inject('filesDir'); let n = 0; const walk = (p: string) => { if (!existsSync(p)) return; for (const x of readdirSync(p, { withFileTypes: true })) x.isDirectory() ? walk(join(p, x.name)) : n++; }; walk(d); return n; };

describe.skipIf(!HOST)('настоящий ClamAV', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let c: Client;
  let candId = '';
  const env = { FILE_SCAN_MODE: 'clamav', CLAMAV_HOST: HOST!, CLAMAV_PORT: PORT };
  const upload = (cl: Client, data: Buffer) => cl.upload(`/api/admin/candidates/${candId}/files`, data, 'resume.pdf');

  beforeAll(async () => {
    srv = await startServer(env);
    const a = await admin();
    c = new Client(undefined, srv.url);
    for (const [k, v] of a.client.cookies) c.cookies.set(k, v); // та же база и тот же ключ: сессия действует
    candId = (await c.json('POST', '/api/admin/candidates', { full_name: 'Кандидат Антивирус Тест', city: 'Москва' })).id;
  }, 60_000);
  afterAll(async () => { await srv?.stop(); });

  it('чистый PDF принимается со статусом «проверен»', async () => {
    const r = await upload(c, makePdf('Clean resume'));
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await r.json()).scan_status).toBe('clean');
  });

  it('PDF с тестовым вирусом отклоняется, не сохраняется и попадает в журнал', async () => {
    const before = storedCount();
    for (const [name, data] of [
      ['маркер в тексте страницы', makePdf('IKR-MALWARE-TEST-MARKER-7f3a')],
      ['EICAR после конца PDF', Buffer.concat([makePdf('x'), Buffer.from('\n%' + EICAR + '\n')])],
    ] as const) {
      const r = await upload(c, data);
      expect(r.status, name).toBe(422);
      expect((await r.json()).error).toBe('infected');
    }
    expect(storedCount()).toBe(before);
    const ev = await owner(async (db) => (await db.query(`select details from audit_log where action = 'file.rejected_infected' and entity_id = $1`, [candId])).rows);
    expect(ev).toHaveLength(2);
    expect(ev.map((e) => e.details.signature).join(' ')).toMatch(/FOUND|Test\.|Eicar|EICAR/i);
  });

  it('ClamAV недоступен — файл не принимается', async () => {
    const down = await startServer({ ...env, CLAMAV_PORT: '1' });
    try {
      const d = new Client(undefined, down.url); d.cookies = new Map(c.cookies);
      const before = storedCount();
      expect((await upload(d, makePdf('Clean'))).status).toBe(503);
      expect(storedCount()).toBe(before);
    } finally { await down.stop(); }
  });

  it.skipIf(!SMALL)('файл больше лимита ClamAV не считается чистым', async () => {
    const small = await startServer({ ...env, CLAMAV_PORT: SMALL! });
    try {
      const d = new Client(undefined, small.url); d.cookies = new Map(c.cookies);
      const big = Buffer.concat([makePdf('big'), Buffer.from(('\n%' + 'A'.repeat(1000)).repeat(1500))]);
      expect(big.length).toBeGreaterThan(1.2 * 1024 * 1024);
      expect((await upload(d, big)).status).toBe(503);
    } finally { await small.stop(); }
  });

  it('повторная проверка: файл без проверки уходит в карантин, если он заражён', async () => {
    // Файл, загруженный при выключенной проверке (основной сервер, FILE_SCAN_MODE=off)
    const a = await admin();
    const r = await a.client.upload(`/api/admin/candidates/${candId}/files`, makePdf('IKR-MALWARE-TEST-MARKER-7f3a'), 'old.pdf');
    const fid = (await r.json()).id;
    const r2 = await a.client.upload(`/api/admin/candidates/${candId}/files`, makePdf('Old clean'), 'old-clean.pdf');
    const cleanId = (await r2.json()).id;
    expect((await a.client.get(`/api/admin/files/${fid}`)).status).toBe(200);
    execFileSync('npx', ['tsx', 'scripts/rescan-files.ts', '--as', a.email], { env: { ...process.env, ...JSON.parse(inject('serverEnv')), ...env }, stdio: 'pipe' });
    const st = await owner(async (db) => (await db.query('select id, scan_status from files where id = any($1)', [[fid, cleanId]])).rows);
    expect(Object.fromEntries(st.map((x) => [x.id, x.scan_status]))).toEqual({ [fid]: 'infected', [cleanId]: 'clean' });
    expect((await a.client.get(`/api/admin/files/${fid}`)).status).toBe(409); // карантин: не открывается
    expect((await a.client.get(`/api/admin/files/${cleanId}`)).status).toBe(200);
  });
});
