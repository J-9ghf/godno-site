import { withUser } from '../db';
import { audit } from '../audit';
import { conflict, HttpError, notFound } from '../errors';
import { acceptUpload, type Kind } from '../files';
import { fileStore } from '../storage';
import type { Actor } from '../session';

export async function uploadCandidateFile(actor: string, candidateId: string, file: File, kind: Kind) {
  // Сначала проверяем доступ к кандидату (RLS: только администратор), затем принимаем файл
  const exists = await withUser(actor, async (db) => (await db.query('select 1 from candidates where id = $1 and anonymized_at is null', [candidateId])).rowCount);
  if (!exists) throw notFound();
  let f: Awaited<ReturnType<typeof acceptUpload>>;
  try { f = await acceptUpload(file, kind, { candidateId }); }
  catch (e) {
    // Заражённый файл не сохраняется; попытка записывается в журнал (имя файла и сигнатура, без содержимого)
    if (e instanceof HttpError && e.code === 'infected') {
      const signature = (e as HttpError & { signature?: string }).signature ?? '';
      console.warn(`[scan] отклонён заражённый файл: кандидат ${candidateId}, сигнатура ${signature}`);
      await withUser(actor, (db) => audit(db, { actorId: actor, action: 'file.rejected_infected', entityType: 'candidate', entityId: candidateId, details: { kind, signature, size: file.size } }));
    }
    throw e;
  }
  try {
    return await withUser(actor, async (db) => {
      const r = await db.query(
        `insert into files(candidate_id, kind, storage_key, original_name, mime, size_bytes, sha256, page_count, scan_status, scanned_at, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9, case when $9 = 'clean' then now() end, $10) returning id, kind, original_name, mime, size_bytes, page_count, scan_status, created_at`,
        [candidateId, kind, f.storage_key, f.original_name, f.mime, f.size_bytes, f.sha256, f.page_count, f.scan_status, actor]);
      await audit(db, { actorId: actor, action: 'file.uploaded', entityType: 'file', entityId: r.rows[0].id, details: { kind, size: f.size_bytes, candidate_id: candidateId } });
      return r.rows[0];
    });
  } catch (e) {
    await fileStore().delete(f.storage_key).catch(() => {});
    throw e;
  }
}

export async function deleteFile(actor: string, id: string) {
  await withUser(actor, async (db) => {
    const r = await db.query('update files set deleted_at = now() where id = $1 and deleted_at is null returning candidate_id', [id]);
    if (!r.rowCount) throw notFound();
    await audit(db, { actorId: actor, action: 'file.deleted', entityType: 'file', entityId: id });
  });
}

export async function adminReadFile(actor: string, id: string, download: boolean) {
  const f = await withUser(actor, async (db) => {
    const r = await db.query('select storage_key, mime, original_name, scan_status from files where id = $1 and deleted_at is null', [id]);
    if (!r.rowCount) throw notFound();
    if (r.rows[0].scan_status === 'infected') throw conflict('Файл в карантине: он не прошёл антивирусную проверку и не открывается');
    await audit(db, { actorId: actor, action: download ? 'file.downloaded' : 'file.viewed', entityType: 'file', entityId: id });
    return r.rows[0];
  });
  return { meta: f, data: await fileStore().get(f.storage_key) };
}

// Резюме для клиента: права проверяет функция базы client_resume на каждый запрос
export async function clientReadResume(a: Actor, presentationId: string, download: boolean) {
  const f = await withUser(a.userId, async (db) => {
    const r = await db.query('select * from client_resume($1, $2)', [presentationId, download]);
    const company = await db.query('select company_id from client_presentations where presentation_id = $1', [presentationId]);
    await audit(db, { actorId: a.userId, action: download ? 'client.resume_downloaded' : 'client.resume_viewed', entityType: 'presentation', entityId: presentationId, companyId: company.rows[0]?.company_id });
    return r.rows[0];
  });
  return { meta: f, data: await fileStore().get(f.storage_key) };
}
