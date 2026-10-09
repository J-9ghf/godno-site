-- Ядро схемы: типы, справочники, таблицы.
-- Только стандартный PostgreSQL (>= 15). Специфичное для Supabase — одна ссылка на auth.users.

create schema if not exists app;

-- ───────────────────────── Типы ─────────────────────────

create type public.user_role as enum ('client', 'manager', 'admin');

-- Порядок значений важен: «этап X и дальше» = stage >= X (кроме rejected).
create type public.candidate_stage as enum ('offered', 'interested', 'interview', 'offer', 'hired', 'rejected');

create type public.request_status as enum ('new', 'search', 'offered', 'interview', 'closed', 'paused', 'cancelled');
create type public.request_source as enum ('site', 'bot', 'manager', 'client');
create type public.candidate_source as enum ('site', 'manager');
create type public.pool_status as enum ('new', 'in_work', 'reserve', 'archived');
create type public.client_decision as enum ('interested', 'interview', 'rejected');
create type public.company_status as enum ('active', 'paused', 'archived');
create type public.interview_format as enum ('online', 'office', 'phone');
create type public.interview_status as enum ('scheduled', 'done', 'cancelled');
create type public.document_type as enum ('contract', 'invoice', 'act', 'other');
create type public.document_status as enum ('draft', 'sent', 'signed', 'paid', 'cancelled');
create type public.service_request_status as enum ('new', 'in_progress', 'done', 'declined');

-- ───────────────────────── Общие функции ─────────────────────────

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Нормализация телефона для поиска дублей: только цифры, 8XXXXXXXXXX → 7XXXXXXXXXX.
create or replace function app.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when d = '' then null
    when length(d) = 11 and left(d, 1) = '8' then '7' || substr(d, 2)
    when length(d) = 10 then '7' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s;
$$;

-- ───────────────────────── Справочники ─────────────────────────

-- Позиции / направления: общий список для формы заявки и формы резюме.
create table public.positions (
  code text primary key,
  label text not null,
  sort int not null default 0,
  is_active boolean not null default true
);

create table public.rejection_reasons (
  id serial primary key,
  label text not null unique,
  sort int not null default 0,
  is_active boolean not null default true
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Компании и пользователи ─────────────────────────

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  inn text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status public.company_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  -- id совпадает с id пользователя в сервисе авторизации.
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  role public.user_role not null,
  company_id uuid references public.companies (id) on delete restrict,
  is_company_lead boolean not null default false,
  is_active boolean not null default true,
  notify_email boolean not null default true,
  telegram_chat_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_client_has_company check ((role = 'client') = (company_id is not null)),
  constraint profiles_lead_is_client check (not is_company_lead or role = 'client')
);
create unique index profiles_email_key on public.profiles (lower(email));
create index profiles_company_idx on public.profiles (company_id);

create table public.manager_companies (
  manager_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (manager_id, company_id)
);
create index manager_companies_company_idx on public.manager_companies (company_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role public.user_role not null,
  company_id uuid references public.companies (id) on delete cascade,
  is_company_lead boolean not null default false,
  full_name text,
  -- Хранится только SHA-256 токена; сам токен есть лишь в письме.
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '72 hours',
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_client_has_company check ((role = 'client') = (company_id is not null)),
  constraint invitations_lead_is_client check (not is_company_lead or role = 'client'),
  -- Ссылка живёт не дольше 72 часов, даже если запись создана в обход сервера.
  constraint invitations_ttl check (expires_at <= created_at + interval '72 hours')
);
create index invitations_email_idx on public.invitations (lower(email));

-- Попытки входа: основа блокировки на 15 минут после 5 ошибок.
create table public.login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  ip inet,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_email_idx on public.login_attempts (lower(email), created_at desc);
create index login_attempts_ip_idx on public.login_attempts (ip, created_at desc);

-- ───────────────────────── Заявки и кандидаты ─────────────────────────

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  -- NULL: заявка пришла с сайта и ещё не привязана менеджером к компании.
  company_id uuid references public.companies (id) on delete restrict,
  title text not null default '',
  position_code text references public.positions (code),
  requirements text,
  budget text,
  status public.request_status not null default 'new',
  source public.request_source not null,
  -- Контакт из формы на сайте.
  contact_name text,
  contact_phone text,
  contact_company text,
  consent_at timestamptz,
  assigned_manager_id uuid references public.profiles (id) on delete set null,
  replacement_of uuid references public.requests (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index requests_company_idx on public.requests (company_id);
create index requests_status_idx on public.requests (status);
create index requests_manager_idx on public.requests (assigned_manager_id);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  phone text,
  phone_norm text generated always as (app.normalize_phone(phone)) stored,
  telegram text,
  email text,
  email_norm text generated always as (lower(nullif(trim(email), ''))) stored,
  city text,
  position_code text references public.positions (code),
  -- Ключ объекта в хранилище, не URL.
  resume_path text,
  video_url text,
  video_path text,
  -- Разбор для клиента: кто это, что движет, риски, горизонт, наше мнение.
  summary text,
  source public.candidate_source not null,
  pool_status public.pool_status not null default 'new',
  tags text[] not null default '{}',
  internal_notes text,
  consent_at timestamptz,
  consent_version text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidates_site_needs_consent check (source <> 'site' or consent_at is not null),
  constraint candidates_has_contact check (phone is not null or telegram is not null or email is not null)
);
create index candidates_phone_idx on public.candidates (phone_norm);
create index candidates_email_idx on public.candidates (email_norm);
create index candidates_position_idx on public.candidates (position_code);

create table public.request_candidates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  stage public.candidate_stage not null default 'offered',
  client_decision public.client_decision,
  client_decided_at timestamptz,
  client_decided_by uuid references public.profiles (id) on delete set null,
  rejection_reason_id int references public.rejection_reasons (id),
  rejection_comment text,
  recruiter_comment text,
  proposed_by uuid references public.profiles (id) on delete set null,
  proposed_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, candidate_id),
  constraint rc_rejected_needs_reason check (stage <> 'rejected' or rejection_reason_id is not null)
);
create index request_candidates_candidate_idx on public.request_candidates (candidate_id);

create table public.stage_history (
  id bigint generated always as identity primary key,
  request_candidate_id uuid not null references public.request_candidates (id) on delete cascade,
  from_stage public.candidate_stage,
  to_stage public.candidate_stage not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index stage_history_rc_idx on public.stage_history (request_candidate_id, changed_at);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  request_candidate_id uuid not null references public.request_candidates (id) on delete cascade,
  scheduled_at timestamptz not null,
  format public.interview_format not null default 'online',
  location text,
  status public.interview_status not null default 'scheduled',
  feedback text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interviews_rc_idx on public.interviews (request_candidate_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  request_id uuid references public.requests (id) on delete set null,
  doc_type public.document_type not null,
  title text not null,
  file_path text,
  status public.document_status not null default 'draft',
  amount numeric(12, 2),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_company_idx on public.documents (company_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  request_id uuid references public.requests (id) on delete cascade,
  request_candidate_id uuid references public.request_candidates (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  attachment_path text,
  created_at timestamptz not null default now()
);
create index messages_company_idx on public.messages (company_id, created_at desc);

-- ───────────────────────── Услуги, NPS, журнал ─────────────────────────

create table public.services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price_text text,
  -- Событие, по которому услугу предлагают в кабинете (vacancy_closed, candidate_hired, many_rejections, no_new_requests).
  show_on_event text,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  status public.service_request_status not null default 'new',
  assigned_to uuid references public.profiles (id) on delete set null,
  comment text,
  amount numeric(12, 2),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index service_requests_company_idx on public.service_requests (company_id);

create table public.nps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  request_id uuid references public.requests (id) on delete set null,
  score int not null check (score between 0 and 10),
  comment text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  actor_role public.user_role,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- ───────────────────────── updated_at ─────────────────────────

create trigger companies_touch before update on public.companies for each row execute function app.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();
create trigger requests_touch before update on public.requests for each row execute function app.touch_updated_at();
create trigger candidates_touch before update on public.candidates for each row execute function app.touch_updated_at();
create trigger request_candidates_touch before update on public.request_candidates for each row execute function app.touch_updated_at();
create trigger interviews_touch before update on public.interviews for each row execute function app.touch_updated_at();
create trigger documents_touch before update on public.documents for each row execute function app.touch_updated_at();
create trigger services_touch before update on public.services for each row execute function app.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute function app.touch_updated_at();

-- ───────────────────────── Справочные данные (нужны в любой среде) ─────────────────────────

insert into public.positions (code, label, sort) values
  ('assistant', 'Ассистент или помощник руководителя', 10),
  ('key_employee', 'Ключевой сотрудник', 20),
  ('nanny', 'Няня', 30),
  ('governess', 'Гувернантка', 40),
  ('housekeeper', 'Домработница', 50),
  ('cook', 'Повар', 60),
  ('driver', 'Семейный водитель', 70),
  ('caregiver', 'Сиделка', 80),
  ('house_manager', 'Управляющий домом', 90),
  ('teacher', 'Педагог', 100),
  ('other', 'Другое', 110);

-- Причины отказа — стартовый список, админ меняет в настройках.
insert into public.rejection_reasons (label, sort) values
  ('Не подходит опыт', 10),
  ('Не подходят зарплатные ожидания', 20),
  ('Не совпали по ценностям и стилю работы', 30),
  ('Не подходит график или локация', 40),
  ('Кандидат отказался', 50),
  ('Другое', 100);

insert into public.settings (key, value, description) values
  ('guarantee_days', '60', 'Гарантийный период после выхода сотрудника, дней'),
  ('idle_timeout_minutes', '30', 'Автовыход после бездействия, минут'),
  ('login_max_attempts', '5', 'Неверных попыток входа до блокировки'),
  ('login_lock_minutes', '15', 'Длительность блокировки входа, минут'),
  ('invitation_ttl_hours', '72', 'Срок действия ссылки-приглашения, часов');
