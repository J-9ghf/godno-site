// Безопасность файлов: загрузка ничего не открывает клиенту, PDF с активным содержимым отклоняются, ClamAV.
import { beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { makePdf } from './helpers';
import { buildWorld, type World } from './world';
import { scanBuffer } from '../src/lib/scan';

let w: World;
beforeAll(async () => { w = await buildWorld('fsec'); });

function pdfWith(extraCatalog: string, extraObjects: string[] = []) {
  const base = makePdf('Active').toString('latin1');
  return Buffer.from(base.replace('<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Catalog /Pages 2 0 R ${extraCatalog} >>`) + extraObjects.join('\n'), 'latin1');
}

describe('Явное открытие резюме', () => {
  it('новая загрузка не меняет то, что видит клиент, пока администратор её не выберет', async () => {
    const before = Buffer.from(await (await w.a1.client.get(`/api/client/presentations/${w.pXA.id}/resume`)).arrayBuffer());
    const up = await w.adm.upload(`/api/admin/candidates/${w.X.id}/files`, makePdf('Новая версия'), 'new.pdf');
    const newFile = await up.json();
    const after = Buffer.from(await (await w.a1.client.get(`/api/client/presentations/${w.pXA.id}/resume`)).arrayBuffer());
    expect(after.equals(before)).toBe(true);
    await w.adm.json('PATCH', `/api/admin/presentations/${w.pXA.id}`, { resume_file_id: newFile.id });
    const now = Buffer.from(await (await w.a1.client.get(`/api/client/presentations/${w.pXA.id}/resume`)).arrayBuffer());
    expect(now.equals(before)).toBe(false);
  });

  it('право просмотра без выбранного файла не сохраняется; файл другого кандидата выбрать нельзя', async () => {
    expect((await w.adm.patch(`/api/admin/presentations/${w.pZB.id}`, { can_view_resume: true })).status).toBe(400);
    expect((await w.adm.patch(`/api/admin/presentations/${w.pZB.id}`, { can_view_resume: true, resume_file_id: w.resume[w.X.id] })).status).toBe(409);
    expect((await w.adm.patch(`/api/admin/presentations/${w.pZB.id}`, { can_view_resume: true, resume_file_id: w.resume[w.Z.id] })).status).toBe(200);
  });
});

describe('PDF с активным содержимым', () => {
  const cases: [string, Buffer][] = [
    ['скрипт при открытии', pdfWith('/OpenAction << /S /JavaScript /JS (app.alert(1)) >>')],
    ['запуск программы', pdfWith('/OpenAction << /S /Launch /F (calc.exe) >>')],
    ['вложенный файл', pdfWith('/Names << /EmbeddedFiles << /Names [(a.exe) << /Type /Filespec /F (a.exe) >>] >> >>')],
    ['форма XFA', pdfWith('/AcroForm << /XFA (x) /Fields [] >>')],
  ];
  for (const [name, buf] of cases) {
    it(`отклоняется: ${name}`, async () => {
      const r = await w.adm.upload(`/api/admin/candidates/${w.Y.id}/files`, buf, 'cv.pdf');
      expect(r.status).toBe(400);
      expect((await r.json()).message).toContain('активное содержимое');
    });
  }
  it('обычный PDF принимается', async () => {
    expect((await w.adm.upload(`/api/admin/candidates/${w.Y.id}/files`, makePdf('Plain'), 'cv.pdf')).status).toBe(200);
  });
});

describe('Клиент ClamAV (INSTREAM)', () => {
  function fakeClamd(answer: string) {
    return new Promise<{ port: number; close: () => void; received: () => number }>((res) => {
      let bytes = 0;
      const srv = createServer((s) => {
        let buf = Buffer.alloc(0);
        s.on('data', (d) => {
          buf = Buffer.concat([buf, d as Buffer]);
          if (buf.length >= 14 && buf.subarray(buf.length - 4).equals(Buffer.alloc(4))) { bytes = buf.length; s.end(answer + '\0'); }
        });
      });
      srv.listen(0, '127.0.0.1', () => res({ port: (srv.address() as any).port, close: () => srv.close(), received: () => bytes }));
    });
  }
  it('чистый файл', async () => {
    const f = await fakeClamd('stream: OK');
    expect(await scanBuffer(Buffer.alloc(200_000, 1), '127.0.0.1', f.port)).toEqual({ status: 'clean' });
    expect(f.received()).toBeGreaterThan(200_000);
    f.close();
  });
  it('заражённый файл', async () => {
    const f = await fakeClamd('stream: Eicar-Test-Signature FOUND');
    expect(await scanBuffer(Buffer.from('x'), '127.0.0.1', f.port)).toEqual({ status: 'infected', signature: 'Eicar-Test-Signature' });
    f.close();
  });
  it('ClamAV недоступен — ошибка, а не «чисто»', async () => {
    await expect(scanBuffer(Buffer.from('x'), '127.0.0.1', 1)).rejects.toThrow(/ClamAV/);
  });
});
