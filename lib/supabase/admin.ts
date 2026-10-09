import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let client: SupabaseClient | null = null;

/**
 * Клиент с service role: обходит RLS. Только для серверного кода, который сам проверил права:
 * вход, приглашения, сброс пароля, журнал, формы сайта. Ключ никогда не попадает в браузер:
 * импорт этого модуля из клиентского компонента ломает сборку (server-only).
 */
export function adminClient(): SupabaseClient {
  if (client) return client;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
