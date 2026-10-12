// Журнал важных действий. Только добавление записей. Персональные данные кандидатов в детали не пишем.
import type { Db } from './db';

export async function audit(db: Db, e: {
  actorId: string | null; action: string; entityType?: string; entityId?: string;
  companyId?: string | null; ip?: string | null; details?: Record<string, unknown>; kind?: 'user' | 'system' | 'public';
}) {
  await db.query(
    `insert into audit_log(actor_id, actor_kind, action, entity_type, entity_id, company_id, ip, details)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [e.actorId, e.kind ?? (e.actorId ? 'user' : 'system'), e.action, e.entityType ?? null, e.entityId ?? null,
     e.companyId ?? null, e.ip ?? null, JSON.stringify(e.details ?? {})]);
}
