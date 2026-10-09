-- Минимальная эмуляция того, что Supabase создаёт сам: роли, схема auth, схема storage.
-- Нужна ТОЛЬКО для локальных тестов на обычном PostgreSQL. В Supabase не применяется.
-- При переезде на self-hosted Supabase всё это создаёт сам Supabase.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  aud text,
  role text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  instance_id uuid,
  confirmation_token text,
  recovery_token text,
  email_change_token_new text,
  email_change_token_current text,
  email_change text,
  phone_change text,
  phone_change_token text,
  reauthentication_token text,
  banned_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
