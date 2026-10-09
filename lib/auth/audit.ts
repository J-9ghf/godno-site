import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { requestMeta } from './request-meta';

interface AuditEntry {
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: 'client' | 'manager' | 'admin' | null;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

/**
 * Запись в журнал действий от имени сервера (входы, выходы, приглашения).
 * Ошибка записи не ломает действие пользователя, но попадает в лог.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  const { ip, userAgent } = await requestMeta();
  const { error } = await adminClient()
    .from('audit_log')
    .insert({
      action: entry.action,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      actor_role: entry.actorRole ?? null,
      entity: entry.entity ?? null,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? {},
      ip,
      user_agent: userAgent?.slice(0, 500) ?? null,
    });
  if (error) console.error('[audit] не удалось записать', entry.action, error.message);
}
