import 'server-only';
import { adminClient } from '@/lib/supabase/admin';

export interface Position {
  code: string;
  label: string;
}

let cache: { at: number; list: Position[] } | null = null;

/** Список позиций для форм сайта (справочник в базе, админ меняет в настройках). Кеш 5 минут. */
export async function getPositions(): Promise<Position[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.list;
  const { data, error } = await adminClient().from('positions').select('code, label').eq('is_active', true).order('sort');
  if (error) throw new Error(`Не удалось загрузить позиции: ${error.message}`);
  cache = { at: Date.now(), list: data };
  return data;
}
