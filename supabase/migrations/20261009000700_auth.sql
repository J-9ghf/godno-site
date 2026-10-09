-- Вход: двойная проверка для админа, одноразовые коды и токены, лимиты частоты.

-- ───────────────────────── Подтверждённые сессии ─────────────────────────
-- Сессия админа получает права только после второго шага (код на почту).
-- Сервер записывает сюда id сессии из JWT (claim session_id) после проверки кода.
-- Если кто-то войдёт в Auth напрямую, минуя приложение, у такой сессии прав админа не будет.

create table public.verified_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours'
);
create index verified_sessions_user_idx on public.verified_sessions (user_id);
alter table public.verified_sessions enable row level security;

create or replace function app.current_session_id()
returns uuid
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', '')::uuid;
$$;

create or replace function app.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = app.current_user_id()
    and p.is_active
    and (p.role <> 'admin' or exists (
      select 1 from public.verified_sessions v
      where v.session_id = app.current_session_id() and v.user_id = p.id and v.expires_at > now()));
$$;

-- ───────────────────────── Одноразовые токены ─────────────────────────
-- Коды входа (6 цифр, 10 минут, 5 попыток) и ссылки сброса пароля (1 час).
-- Хранится только SHA-256 значения.

create type public.auth_token_kind as enum ('login_code', 'password_reset');

create table public.auth_tokens (
  id uuid primary key default gen_random_uuid(),
  kind public.auth_token_kind not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index auth_tokens_lookup_idx on public.auth_tokens (kind, token_hash);
create index auth_tokens_user_idx on public.auth_tokens (user_id, kind, created_at desc);
alter table public.auth_tokens enable row level security;

-- ───────────────────────── Лимиты частоты ─────────────────────────
-- Общий счётчик для «забыли пароль», форм сайта и т. п. Ключ задаёт сервер, например 'forgot:ip:1.2.3.4'.

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_key_idx on public.rate_limit_events (key, created_at desc);
alter table public.rate_limit_events enable row level security;

-- Регистрирует событие и возвращает true, если лимит превышен (событие при этом не считается).
create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.rate_limit_events
  where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_max then
    return true;
  end if;
  insert into public.rate_limit_events (key) values (p_key);
  -- Старые события подчищаются попутно.
  if random() < 0.01 then
    delete from public.rate_limit_events where created_at < now() - interval '1 day';
  end if;
  return false;
end;
$$;

revoke all on public.verified_sessions, public.auth_tokens, public.rate_limit_events from anon, authenticated;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- ───────────────────────── Кто я ─────────────────────────
-- Роль с учётом активности и второго шага у админа. Неподтверждённый админ получает role = NULL.

create or replace function public.my_access()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role public.user_role,
  company_id uuid,
  company_name text,
  is_company_lead boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.email, p.full_name, app.current_role(), p.company_id, c.name, p.is_company_lead
  from public.profiles p
  left join public.companies c on c.id = p.company_id
  where p.id = app.current_user_id();
$$;

revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- ───────────────────────── Отзыв всех сессий пользователя ─────────────────────────
-- При сбросе пароля и отключении пользователя. Удаляет сессии сервиса авторизации
-- (auth.sessions есть в Supabase и в self-hosted GoTrue) и подтверждения второго шага.
-- На базе без auth.sessions (локальная эмуляция) удаляются только подтверждения.

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.verified_sessions where user_id = p_user_id;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
