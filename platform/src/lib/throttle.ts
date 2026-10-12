// Ограничение попыток входа: по почте (5 за 15 минут → блок на 15 минут) и по IP (30 за 15 минут).
// Ключ почты хранится как SHA-256, поэтому для несуществующих адресов поведение такое же, как для существующих.
import { createHash } from 'node:crypto';
import type { Db } from './db';

export const LIMITS = { email: { max: 5, windowMin: 15, lockMin: 15 }, ip: { max: 30, windowMin: 15, lockMin: 15 } };
export const emailKey = (email: string) => 'email:' + createHash('sha256').update(email).digest('hex');
export const ipKey = (ip: string) => 'ip:' + ip;

export async function lockedUntil(db: Db, keys: string[]): Promise<Date | null> {
  const r = await db.query('select max(locked_until) as u from login_throttle where key = any($1) and locked_until > now()', [keys]);
  return r.rows[0]?.u ?? null;
}

export async function registerFailure(db: Db, key: string, lim: { max: number; windowMin: number; lockMin: number }) {
  const r = await db.query(
    `insert into login_throttle(key, failures, window_started_at) values ($1, 1, now())
     on conflict (key) do update set
       failures = case when login_throttle.window_started_at < now() - make_interval(mins => $2) then 1 else login_throttle.failures + 1 end,
       window_started_at = case when login_throttle.window_started_at < now() - make_interval(mins => $2) then now() else login_throttle.window_started_at end
     returning failures`, [key, lim.windowMin]);
  if (r.rows[0].failures >= lim.max) {
    await db.query(`update login_throttle set locked_until = now() + make_interval(mins => $2), failures = 0, window_started_at = now() where key = $1`, [key, lim.lockMin]);
    return true;
  }
  return false;
}

export async function clear(db: Db, key: string) {
  await db.query('delete from login_throttle where key = $1', [key]);
}
