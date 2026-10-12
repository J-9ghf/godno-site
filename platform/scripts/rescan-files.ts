// Повторная антивирусная проверка сохранённых файлов через ClamAV: npm run rescan-files -- --as admin@example.ru [--all]
// Без --all проверяются файлы со статусом «не проверен» или «ошибка» (например, загруженные до включения ClamAV).
// С --all — все файлы (имеет смысл после обновления баз сигнатур). Заражённый файл помечается и уходит в карантин:
// клиенты и администраторы его не открывают, выбрать его для клиента нельзя. Действует от имени указанного администратора.
import { withUser, withSystem, pool } from '../src/lib/db';
import { env } from '../src/lib/env';
import { scanBuffer } from '../src/lib/scan';
import { fileStore } from '../src/lib/storage';
import { audit } from '../src/lib/audit';

const args = process.argv.slice(2);
const asEmail = (args[args.indexOf('--as') + 1] ?? '').toLowerCase();
const all = args.includes('--all');
const e = env();
if (!args.includes('--as') || !asEmail) { console.error('Укажите администратора: npm run rescan-files -- --as admin@example.ru [--all]'); process.exit(1); }
if (e.FILE_SCAN_MODE !== 'clamav') { console.error('Нужен FILE_SCAN_MODE=clamav и CLAMAV_HOST'); process.exit(1); }

let failed = 0;
try {
  const adminId = await withSystem(async (db) => (await db.query('select id from "user" where email = $1', [asEmail])).rows[0]?.id);
  if (!adminId) throw new Error('Пользователь не найден');
  const files = await withUser(adminId, async (db) => (await db.query(
    `select id, storage_key, scan_status from files where deleted_at is null ${all ? '' : "and scan_status in ('not_scanned','error')"} order by created_at`)).rows);
  if (!files.length && !all) {
    // Пустой список и у не-администратора: RLS не показывает ему файлы. Проверяем роль явно
    const isAdmin = await withUser(adminId, async (db) => (await db.query('select app_is_admin() ok')).rows[0].ok);
    if (!isAdmin) throw new Error('Указанный пользователь не администратор');
  }
  const counts = { clean: 0, infected: 0, error: 0 };
  for (const f of files) {
    let status: 'clean' | 'infected' | 'error'; let signature: string | undefined;
    try {
      const r = await scanBuffer(await fileStore().get(f.storage_key), e.CLAMAV_HOST!, e.CLAMAV_PORT);
      status = r.status; signature = r.status === 'infected' ? r.signature : undefined;
    } catch (err) { status = 'error'; console.error(`файл ${f.id}: ${(err as Error).message}`); }
    counts[status]++;
    await withUser(adminId, async (db) => {
      await db.query(`update files set scan_status = $2, scanned_at = case when $2 = 'error' then scanned_at else now() end where id = $1`, [f.id, status]);
      if (status !== f.scan_status) await audit(db, { actorId: adminId, action: 'file.rescanned', entityType: 'file', entityId: f.id, details: { from: f.scan_status, to: status, signature } });
    });
    if (status === 'infected') console.warn(`КАРАНТИН: файл ${f.id}, сигнатура ${signature}`);
  }
  failed = counts.error;
  console.log(`Проверено файлов: ${files.length}. Чистых: ${counts.clean}, заражённых: ${counts.infected}, ошибок: ${counts.error}.`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool().end();
}
if (failed) process.exitCode = 2;
