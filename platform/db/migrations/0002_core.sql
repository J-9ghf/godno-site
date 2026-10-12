-- Ядро платформы: компании, пользователи и роли, вакансии, кандидаты, представления клиентам,
-- этапы и их история, обратная связь, файлы и ссылки, согласия, журнал действий.

-- ---------- Пользователи и роли ----------
create table user_security (
  user_id text primary key references "user"(id) on delete cascade,
  is_blocked boolean not null default false,
  blocked_at timestamptz, blocked_by text references "user"(id), blocked_reason text,
  last_login_at timestamptz
);

-- Внутренняя команда. 'manager' заложен для будущей роли, интерфейса для неё пока нет.
create table staff_roles (
  user_id text primary key references "user"(id) on delete cascade,
  role text not null check (role in ('admin','manager')),
  created_at timestamptz not null default now(),
  created_by text references "user"(id)
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 200),
  sphere text, city text, contact_name text, phone text, email text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_by text references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Будущему менеджеру назначаются клиенты
create table staff_assignments (
  user_id text not null references "user"(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  primary key (user_id, company_id)
);

-- Пользователи клиента. Несколько пользователей на компанию, роли: owner, member, viewer.
create table company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role text not null check (role in ('owner','member','viewer')),
  permissions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by text references "user"(id),
  revoked_at timestamptz, revoked_by text references "user"(id),
  unique (company_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  company_id uuid references companies(id) on delete cascade,
  member_role text check (member_role in ('owner','member','viewer')),
  staff_role text check (staff_role in ('admin','manager')),
  token_hash text not null unique,                 -- SHA-256 от токена; сам токен есть только в письме
  expires_at timestamptz not null,
  created_by text references "user"(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz, accepted_user_id text references "user"(id),
  revoked_at timestamptz, revoked_by text references "user"(id),
  check ((company_id is not null and member_role is not null and staff_role is null)
      or (company_id is null and member_role is null and staff_role is not null))
);
create index invitations_email_idx on invitations(email);

-- Ограничение попыток входа: ключ 'email:<sha256>' или 'ip:<адрес>'
create table login_throttle (
  key text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);

-- ---------- Подбор ----------
create table vacancies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null check (length(trim(title)) between 2 and 200),
  position_type text, requirements text, budget text,
  status text not null default 'new' check (status in ('new','searching','presented','interview','paused','closed','cancelled')),
  created_by text references "user"(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vacancies_company_idx on vacancies(company_id);

create table candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 2 and 200),
  birth_year integer check (birth_year between 1930 and 2015),
  city text, direction text,
  phone text, email text, telegram text,
  experience_summary text, salary_expectation text,
  source text not null default 'manual' check (source in ('manual','site','base','referral','other')),
  pool_status text not null default 'new' check (pool_status in ('new','checked','offered','employed','reserve')),
  created_by text references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  anonymized_at timestamptz                         -- обезличивание выполняется по согласованному регламенту
);

create table candidate_links (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  kind text not null check (kind in ('video','yandex_disk','other')),
  url text not null check (url ~ '^https://[^\s]+$' and length(url) <= 2000),
  title text,
  added_by text references "user"(id),
  created_at timestamptz not null default now()
);

-- Файлы: резюме и фото кандидата или документы компании. В базе только ключ объекта в закрытом хранилище.
create table files (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id),
  company_id uuid references companies(id),
  kind text not null check (kind in ('resume_pdf','photo','document','other')),
  visibility text not null default 'internal' check (visibility in ('internal','client')),  -- для документов компании
  storage_key text not null unique,
  original_name text not null,
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null,
  page_count integer,
  scan_status text not null default 'not_scanned' check (scan_status in ('not_scanned','clean','infected','error')),
  uploaded_by text references "user"(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((candidate_id is not null) <> (company_id is not null))
);
create index files_candidate_idx on files(candidate_id) where deleted_at is null;

-- ---------- Согласия ----------
create table consent_texts (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('pool_storage','transfer_to_employer','video_photo')),
  version text not null,
  body text not null,
  effective_from date not null,
  created_at timestamptz not null default now(),
  unique (purpose, version)
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id),
  purpose text not null check (purpose in ('pool_storage','transfer_to_employer','video_photo')),
  consent_text_id uuid not null references consent_texts(id),
  scope_company_id uuid references companies(id),   -- согласие на передачу конкретному работодателю
  granted_at timestamptz not null,
  method text not null check (method in ('site_form','paper','email','other')),
  evidence jsonb not null default '{}',
  evidence_file_id uuid references files(id),
  recorded_by text references "user"(id),
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_method text check (withdrawn_method in ('paper','email','phone','other')),
  withdrawn_note text,
  withdrawn_recorded_by text references "user"(id),
  check (scope_company_id is null or purpose = 'transfer_to_employer')
);
create index consents_candidate_idx on consents(candidate_id);

-- ---------- Рассмотрение и представления ----------
-- Внутренние этапы sourced/screening клиент не видит. offered ставится только созданием представления.
create table applications (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references vacancies(id),
  candidate_id uuid not null references candidates(id),
  stage text not null default 'sourced' check (stage in ('sourced','screening','offered','interested','interview','offer','hired','rejected')),
  reject_reason text,
  created_by text references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vacancy_id, candidate_id),
  check (stage <> 'rejected' or reject_reason is not null)
);
create index applications_candidate_idx on applications(candidate_id);

create table stage_history (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id),
  from_stage text, to_stage text not null,
  changed_by text references "user"(id),
  changed_at timestamptz not null default now(),
  reason text,
  on_behalf_of_client boolean not null default false
);
create index stage_history_app_idx on stage_history(application_id, changed_at);

create table presentations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  consent_id uuid not null references consents(id),
  presented_by text references "user"(id),
  presented_at timestamptz not null default now(),
  client_comment text,                      -- комментарий рекрутера для клиента
  analysis jsonb not null default '{}',     -- разбор: who, drive, risk, horizon, opinion
  can_view_resume boolean not null default false,
  can_download_resume boolean not null default false,
  can_view_video boolean not null default false,
  can_view_contacts boolean not null default false,
  revoked_at timestamptz, revoked_by text references "user"(id), revoked_reason text,
  check (not can_download_resume or can_view_resume)
);
create unique index presentations_one_active on presentations(application_id) where revoked_at is null;

create table client_feedback (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  presentation_id uuid not null references presentations(id),
  author_id text not null references "user"(id),
  body text not null check (length(trim(body)) between 1 and 4000),
  rating integer check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

-- Заметки рекрутеров: клиентам недоступны ни при каких условиях
create table internal_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id),
  application_id uuid references applications(id),
  author_id text references "user"(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id text,                       -- без внешнего ключа: запись сохраняется и после удаления пользователя
  actor_kind text not null default 'user' check (actor_kind in ('user','system','public')),
  action text not null,
  entity_type text, entity_id text,
  company_id uuid,
  ip text,
  details jsonb not null default '{}'
);
create index audit_log_at_idx on audit_log(at desc);
create index audit_log_company_idx on audit_log(company_id, at desc);

create table settings (
  id integer primary key default 1 check (id = 1),
  stage_labels jsonb not null,
  reject_reasons_client text[] not null,
  reject_reasons_team text[] not null,
  guarantee_days integer not null check (guarantee_days between 7 and 365)
);
insert into settings values (1,
  '{"sourced":"Найден","screening":"Проверка","offered":"Предложен","interested":"Интересен","interview":"Интервью","offer":"Оффер","hired":"Вышел на работу","rejected":"Отказ"}',
  array['Не подходит по опыту','Не подходят зарплатные ожидания','Не подходит график или формат работы','Не сложился контакт на интервью','Выбрали другого кандидата','Другое'],
  array['Кандидат отказался','Кандидат принял другое предложение','Снят рекрутером после проверки'],
  60);

-- ---------- Права роли приложения ----------
grant select, insert, update, delete on user_security, staff_roles, companies, staff_assignments, company_members,
  invitations, login_throttle, vacancies, candidates, candidate_links, files, consent_texts, consents,
  applications, presentations, client_feedback, internal_notes to ikr_app;
-- История этапов и журнал только пополняются
grant select, insert on stage_history, audit_log to ikr_app;
grant select on settings to ikr_app;
grant update on settings to ikr_app;
