import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ACTIVITY_COOKIE, SESSION_START_COOKIE, baseCookieOptions, maxSessionHours, sessionExpired } from '@/lib/session-config';

/**
 * Защита закрытых разделов на каждом запросе: обновляет токены сессии в cookie,
 * не пускает без входа и выводит после бездействия. Роль проверяют макеты разделов (requireRole).
 */
export async function guardSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL и SUPABASE_ANON_KEY не заданы');

  const supabase = createServerClient(url, key, {
    cookieOptions: baseCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, { ...options, ...baseCookieOptions });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith('/api/');

  if (!data.user) {
    if (isApi) return new NextResponse(null, { status: 401 });
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path);
    return NextResponse.redirect(login);
  }

  const activity = request.cookies.get(ACTIVITY_COOKIE)?.value;
  const start = request.cookies.get(SESSION_START_COOKIE)?.value;
  if (sessionExpired(activity, start)) {
    if (isApi) return new NextResponse(null, { status: 401 });
    return NextResponse.redirect(new URL('/auth/signout?reason=idle', request.url));
  }

  response.cookies.set(ACTIVITY_COOKIE, String(Date.now()), { ...baseCookieOptions, maxAge: maxSessionHours() * 3600 });
  return response;
}
