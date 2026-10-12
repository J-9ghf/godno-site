// Подключение к PostgreSQL ролью приложения (без обхода RLS).
// Каждый запрос выполняется в транзакции, где база знает ID пользователя (app.user_id).
// Роль и компании база вычисляет сама, поэтому подменить их со стороны клиента нельзя.
import pg from 'pg';
import { env } from './env';

let poolInstance: pg.Pool | null = null;
export function pool(): pg.Pool {
  if (!poolInstance) poolInstance = new pg.Pool({ connectionString: env().DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
  return poolInstance;
}

export type Db = pg.PoolClient;

export async function withUser<T>(userId: string | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.user_id', $1, true)", [userId ?? '']);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Служебные операции до входа (приглашения, ограничение попыток): ID пользователя не передаётся,
// поэтому таблицы под RLS для них недоступны.
export const withSystem = <T>(fn: (db: Db) => Promise<T>) => withUser(null, fn);
