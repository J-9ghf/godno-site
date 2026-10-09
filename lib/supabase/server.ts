import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { baseCookieOptions } from '@/lib/session-config';

/**
 * Клиент от имени вошедшего пользователя: все запросы проходят через RLS.
 * Токены сессии хранятся в httpOnly-cookie, браузер к Supabase напрямую не обращается.
 */
export async function createUserClient() {
  const store = await cookies();
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: baseCookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, { ...options, ...baseCookieOptions });
          }
        } catch {
          // Вызов из серверного компонента: cookie обновит proxy.ts.
        }
      },
    },
  });
}

/** Клиент без сохранения сессии: только чтобы проверить пароль, ничего не записывая в cookie. */
export function createStatelessClient() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
