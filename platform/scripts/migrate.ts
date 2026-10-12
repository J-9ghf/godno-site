// Применяет SQL-миграции из db/migrations по порядку, каждую в отдельной транзакции.
// Подключается ролью владельца схемы: DATABASE_OWNER_URL. Изменённую после применения миграцию не запускает.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';

export async function migrate(url: string, log = console.log) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`create table if not exists schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    const dir = join(import.meta.dirname, '..', 'db', 'migrations');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const done = new Map((await client.query('select name, checksum from schema_migrations')).rows.map((r) => [r.name, r.checksum]));
    for (const f of files) {
      const sql = await readFile(join(dir, f), 'utf8');
      const sum = createHash('sha256').update(sql).digest('hex');
      if (done.has(f)) {
        if (done.get(f) !== sum) throw new Error(`Миграция ${f} изменена после применения. Создайте новую миграцию.`);
        continue;
      }
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations(name, checksum) values ($1, $2)', [f, sum]);
        await client.query('commit');
        log(`применена ${f}`);
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Ошибка в ${f}: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) { console.error('Нужна переменная DATABASE_OWNER_URL'); process.exit(1); }
  migrate(url).then(() => console.log('Миграции применены'), (e) => { console.error(e.message); process.exit(1); });
}
