-- Доступ: функции текущего пользователя, RLS-политики для client / manager / admin, права.
--
-- Текущий пользователь берётся из request.jwt.claims (так делают Supabase и PostgREST).
-- На обычном PostgreSQL приложение в транзакции выполняет:
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<uuid>"}';
-- auth.uid() намеренно не используется, чтобы политики не зависели от Supabase.

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;

-- Роль активного пользователя. Отключённый пользователь (is_active = false) не получает ничего.
create or replace function app.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = app.current_user_id() and is_active;
$$;

create or replace function app.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select company_id from public.profiles
  where id = app.current_user_id() and is_active and role = 'client';
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
as $$ select coalesce(app.current_role() = 'admin', false); $$;

create or replace function app.is_staff()
returns boolean
language sql
stable
as $$ select coalesce(app.current_role() in ('manager', 'admin'), false); $$;

create or replace function app.is_company_lead()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select is_company_lead from public.profiles
                   where id = app.current_user_id() and is_active and role = 'client'), false);
$$;

-- Команда может работать с компанией: админ — с любой, менеджер — с назначенной.
create or replace function app.manages_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case app.current_role()
    when 'admin' then true
    when 'manager' then exists (
      select 1 from public.manager_companies
      where manager_id = app.current_user_id() and company_id = p_company_id)
    else false
  end;
$$;

-- Назначен ли менеджер на компанию (чтобы клиент видел своего менеджера).
create or replace function app.is_manager_of(p_manager_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_company_id is not null and exists (
    select 1 from public.manager_companies
    where manager_id = p_manager_id and company_id = p_company_id);
$$;

-- Видит данные компании: команда (по правилам выше) или клиент этой компании.
create or replace function app.can_see_company(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select p_company_id is not null
     and (app.manages_company(p_company_id) or p_company_id = app.current_company_id());
$$;

-- Заявка видна команде: менеджеру — по назначенным компаниям, назначенные лично
-- и входящие с сайта, ещё не привязанные к компании (их нужно принять в работу).
create or replace function app.staff_sees_request(p_company_id uuid, p_assigned uuid)
returns boolean
language sql
stable
as $$
  select app.is_admin()
      or (app.current_role() = 'manager'
          and (p_company_id is null
               or app.manages_company(p_company_id)
               or p_assigned = app.current_user_id()));
$$;

-- Компания заявки, для политик дочерних таблиц.
create or replace function app.request_company(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select company_id from public.requests where id = p_request_id; $$;

create or replace function app.rc_company(p_rc_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.company_id
  from public.request_candidates rc
  join public.requests r on r.id = rc.request_id
  where rc.id = p_rc_id;
$$;

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;
revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ───────────────────────── RLS ─────────────────────────

alter table public.positions enable row level security;
alter table public.rejection_reasons enable row level security;
alter table public.settings enable row level security;
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.manager_companies enable row level security;
alter table public.invitations enable row level security;
alter table public.login_attempts enable row level security;
alter table public.requests enable row level security;
alter table public.candidates enable row level security;
alter table public.request_candidates enable row level security;
alter table public.stage_history enable row level security;
alter table public.interviews enable row level security;
alter table public.documents enable row level security;
alter table public.messages enable row level security;
alter table public.services enable row level security;
alter table public.service_requests enable row level security;
alter table public.nps enable row level security;
alter table public.audit_log enable row level security;

-- Анонимный посетитель сайта не обращается к базе напрямую: формы пишет сервер.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Справочники: читают все вошедшие, меняет админ.
create policy positions_read on public.positions for select to authenticated using (true);
create policy positions_admin on public.positions for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy reasons_read on public.rejection_reasons for select to authenticated using (true);
create policy reasons_admin on public.rejection_reasons for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy settings_read on public.settings for select to authenticated using (app.current_role() is not null);
create policy settings_admin on public.settings for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Компании.
create policy companies_read on public.companies for select to authenticated
  using (app.can_see_company(id));
create policy companies_admin on public.companies for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Профили: себя; админ — всех; менеджер — команду и клиентов своих компаний;
-- руководитель клиента — коллег; клиент — менеджеров своей компании.
create policy profiles_read on public.profiles for select to authenticated
  using (
    id = app.current_user_id()
    or app.is_admin()
    or (app.current_role() = 'manager' and (role in ('manager', 'admin') or app.manages_company(company_id)))
    or (app.is_company_lead() and company_id = app.current_company_id())
    or (role = 'manager' and app.is_manager_of(id, app.current_company_id()))
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = app.current_user_id() and app.current_role() is not null)
  with check (id = app.current_user_id());
create policy profiles_admin on public.profiles for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Свои поля пользователь меняет, служебные (роль, компания, активность) — только админ.
create or replace function app.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') and not app.is_admin() then
    if new.role is distinct from old.role
       or new.company_id is distinct from old.company_id
       or new.is_company_lead is distinct from old.is_company_lead
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email
       or new.telegram_chat_id is distinct from old.telegram_chat_id then
      raise exception 'Недостаточно прав для изменения этих полей' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_protect before update on public.profiles
  for each row execute function app.protect_profile_fields();

-- Назначения менеджеров.
create policy mc_read on public.manager_companies for select to authenticated
  using (app.is_admin() or manager_id = app.current_user_id());
create policy mc_admin on public.manager_companies for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Приглашения: админ — любые; руководитель клиента — только рядовых коллег в свою компанию.
create policy invitations_admin on public.invitations for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy invitations_lead_read on public.invitations for select to authenticated
  using (app.is_company_lead() and company_id = app.current_company_id());
create policy invitations_lead_insert on public.invitations for insert to authenticated
  with check (
    app.is_company_lead()
    and role = 'client'
    and company_id = app.current_company_id()
    and not is_company_lead
    and invited_by = app.current_user_id()
  );
create policy invitations_lead_revoke on public.invitations for update to authenticated
  using (app.is_company_lead() and company_id = app.current_company_id() and role = 'client')
  with check (app.is_company_lead() and company_id = app.current_company_id()
              and role = 'client' and not is_company_lead);

-- login_attempts: политик нет, работает только сервер (service_role).

-- Заявки.
create policy requests_staff_read on public.requests for select to authenticated
  using (app.staff_sees_request(company_id, assigned_manager_id));
create policy requests_client_read on public.requests for select to authenticated
  using (company_id is not null and company_id = app.current_company_id());
create policy requests_staff_insert on public.requests for insert to authenticated
  with check (app.is_staff() and (company_id is null or app.manages_company(company_id)));
-- Клиент создаёт заявку (или запрос замены) только в своей компании и только со статусом «Новая».
create policy requests_client_insert on public.requests for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and source = 'client'
    and status = 'new'
    and assigned_manager_id is null
    and created_by = app.current_user_id()
  );
create policy requests_staff_update on public.requests for update to authenticated
  using (app.staff_sees_request(company_id, assigned_manager_id))
  with check (app.is_admin() or (app.is_staff() and (company_id is null or app.manages_company(company_id))));
create policy requests_admin_delete on public.requests for delete to authenticated
  using (app.is_admin());

-- Пул кандидатов: только команда. У клиента нет ни одной политики — таблица ему не видна.
create policy candidates_staff_read on public.candidates for select to authenticated using (app.is_staff());
create policy candidates_staff_insert on public.candidates for insert to authenticated with check (app.is_staff());
create policy candidates_staff_update on public.candidates for update to authenticated
  using (app.is_staff()) with check (app.is_staff());
create policy candidates_admin_delete on public.candidates for delete to authenticated using (app.is_admin());

-- Кандидаты в заявках: читают все, кто видит компанию; меняет команда своих клиентов.
-- Клиент не пишет напрямую — только через public.client_decide().
create policy rc_read on public.request_candidates for select to authenticated
  using (app.can_see_company(app.request_company(request_id)));
create policy rc_staff_insert on public.request_candidates for insert to authenticated
  with check (app.manages_company(app.request_company(request_id)));
create policy rc_staff_update on public.request_candidates for update to authenticated
  using (app.manages_company(app.request_company(request_id)))
  with check (app.manages_company(app.request_company(request_id)));
create policy rc_admin_delete on public.request_candidates for delete to authenticated
  using (app.is_admin());

-- История этапов: только чтение; строки пишет триггер.
create policy history_read on public.stage_history for select to authenticated
  using (app.can_see_company(app.rc_company(request_candidate_id)));

-- Интервью.
create policy interviews_read on public.interviews for select to authenticated
  using (app.can_see_company(app.rc_company(request_candidate_id)));
create policy interviews_staff_write on public.interviews for all to authenticated
  using (app.manages_company(app.rc_company(request_candidate_id)))
  with check (app.manages_company(app.rc_company(request_candidate_id)));

-- Документы.
create policy documents_read on public.documents for select to authenticated
  using (app.can_see_company(company_id));
create policy documents_staff_write on public.documents for insert to authenticated
  with check (app.manages_company(company_id));
create policy documents_staff_update on public.documents for update to authenticated
  using (app.manages_company(company_id)) with check (app.manages_company(company_id));
create policy documents_admin_delete on public.documents for delete to authenticated
  using (app.is_admin());

-- Сообщения: участники переписки — клиент компании и её команда. Только добавление, без правок.
create policy messages_read on public.messages for select to authenticated
  using (app.can_see_company(company_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (app.can_see_company(company_id) and author_id = app.current_user_id());

-- Услуги: каталог видят все вошедшие, редактирует админ.
create policy services_read on public.services for select to authenticated
  using (app.current_role() is not null and (is_active or app.is_staff()));
create policy services_admin on public.services for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Запросы на услуги: клиент создаёт и видит свои; команда — по своим клиентам.
create policy sr_read on public.service_requests for select to authenticated
  using (app.can_see_company(company_id));
create policy sr_client_insert on public.service_requests for insert to authenticated
  with check (company_id = app.current_company_id() and requested_by = app.current_user_id()
              and status = 'new' and assigned_to is null and amount is null);
create policy sr_staff_update on public.service_requests for update to authenticated
  using (app.manages_company(company_id)) with check (app.manages_company(company_id));

-- NPS: клиент оставляет оценку, читает админ.
create policy nps_client_insert on public.nps for insert to authenticated
  with check (company_id = app.current_company_id() and created_by = app.current_user_id());
create policy nps_admin_read on public.nps for select to authenticated using (app.is_admin());

-- Журнал: читает только админ. Записи добавляются функцией app.audit() или сервером.
create policy audit_admin_read on public.audit_log for select to authenticated using (app.is_admin());
revoke insert, update, delete, truncate on public.audit_log from authenticated;
revoke update, delete, truncate on public.stage_history from authenticated;
revoke all on public.login_attempts from authenticated;
