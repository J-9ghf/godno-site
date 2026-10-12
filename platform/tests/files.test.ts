// Загрузка резюме и выдача файлов только после проверки прав на каждый запрос.
import { beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inject } from 'vitest';
import { makePdf } from './helpers';
import { anon, buildWorld, type World } from './world';

let w: World;
beforeAll(async () => { w = await buildWorld('files'); });

const up = (data: Buffer, name: string, kind = 'resume_pdf', mime = 'application/pdf') => w.adm.upload(`/api/admin/candidates/${w.Y.id}/files`, data, name, kind, mime);

describe('Загрузка файлов', () => {
  it('тип проверяется по содержимому, а не по расширению', async () => {
    expect((await up(Buffer.from('просто текст, а не PDF'), 'cv.pdf')).status).toBe(400);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    expect((await up(png, 'cv.pdf')).status).toBe(400);
    expect((await up(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2000, 0x41)]), 'broken.pdf')).status).toBe(400);
  });

  it('файл больше лимита не принимается', async () => {
    const big = Buffer.concat([makePdf(), Buffer.alloc(16 * 1024 * 1024, 0x20)]);
    expect((await up(big, 'big.pdf')).status).toBe(400);
  });

  it('корректный PDF сохраняется под случайным ключом без исходного имени', async () => {
    const r = await up(makePdf('Resume'), '../../etc/Резюме кандидата.pdf');
    expect(r.status).toBe(200);
    const f = await r.json();
    expect(f.page_count).toBe(1);
    expect(f.original_name).toBe('Резюме кандидата.pdf');
    const root = inject('filesDir');
    const all: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((x) => { const p = join(d, x); statSync(p).isDirectory() ? walk(p) : all.push(p.slice(root.length)); });
    walk(root);
    expect(all.every((p) => /^\/cand\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(p))).toBe(true);
  });

  it('клиент с запросом на загрузку не проходит', async () => {
    expect((await w.a1.client.upload(`/api/admin/candidates/${w.Y.id}/files`, makePdf(), 'x.pdf')).status).toBe(403);
  });
});

describe('Выдача резюме', () => {
  it('просмотр разрешён: PDF без кэширования, в изолированном контексте', async () => {
    const r = await w.a1.client.get(`/api/client/presentations/${w.pXA.id}/resume`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-disposition')).toMatch(/^inline/);
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(r.headers.get('content-security-policy')).toContain('sandbox');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await r.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });

  it('скачивание без разрешения — 403, с разрешением — вложение', async () => {
    expect((await w.a1.client.get(`/api/client/presentations/${w.pXA.id}/resume?download=1`)).status).toBe(403);
    const r = await w.b1.client.get(`/api/client/presentations/${w.pXB.id}/resume?download=1`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it('без права просмотра резюме недоступно; отключение права действует со следующего запроса', async () => {
    expect((await w.b1.client.get(`/api/client/presentations/${w.pZB.id}/resume`)).status).toBe(404);
    await w.adm.json('PATCH', `/api/admin/presentations/${w.pYA.id}`, { can_view_resume: false });
    expect((await w.a1.client.get(`/api/client/presentations/${w.pYA.id}/resume`)).status).toBe(404);
    expect((await w.a1.client.json('GET', `/api/client/presentations/${w.pYA.id}`)).has_resume).toBe(false);
  });

  it('файлы недоступны по прямым адресам и анонимно', async () => {
    const c = anon();
    expect((await c.get(`/api/client/presentations/${w.pXA.id}/resume`)).status).toBe(401);
    const cand = await w.adm.json('GET', `/api/admin/candidates/${w.X.id}`);
    const fid = cand.files[0].id;
    expect((await c.get(`/api/admin/files/${fid}`)).status).toBe(401);
    expect((await w.a1.client.get(`/api/admin/files/${fid}`)).status).toBe(403);
    for (const p of ['/files/' + fid, '/.data/files', '/cand/' + w.X.id]) expect((await c.get(p)).status).toBe(404);
  });

  it('удалённый файл больше не выдаётся; просмотры записаны в журнал', async () => {
    const cand = await w.adm.json('GET', `/api/admin/candidates/${w.X.id}`);
    await w.adm.json('DELETE', `/api/admin/files/${cand.files[0].id}`);
    expect((await w.a1.client.get(`/api/client/presentations/${w.pXA.id}/resume`)).status).toBe(404);
    const audit = await w.adm.json('GET', '/api/admin/audit?action=client.resume');
    expect(audit.some((e: any) => e.entity_id === w.pXA.id && e.action === 'client.resume_viewed')).toBe(true);
  });
});
