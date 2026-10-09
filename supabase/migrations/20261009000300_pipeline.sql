-- Воронка: история этапов, правила смены этапов, решения клиента, журнал действий.

-- Кто действует: пользователь из JWT, а для серверных операций под service_role —
-- id, переданный сервером через `set local app.actor_id = '<uuid>'`.
create or replace function app.actor_id()
returns uuid
language sql
stable
as $$
  select coalesce(app.current_user_id(), nullif(current_setting('app.actor_id', true), '')::uuid);
$$;

-- ───────────────────────── Журнал ─────────────────────────

create or replace function app.audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.actor_id();
  v_email text;
  v_role public.user_role;
begin
  select email, role into v_email, v_role from public.profiles where id = v_actor;
  insert into public.audit_log (actor_id, actor_email, actor_role, action, entity, entity_id, details)
  values (v_actor, v_email, v_role, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
end;
$$;
-- Писать в журнал напрямую пользователи не могут: только через функции базы и сервер.
revoke execute on function app.audit(text, text, text, jsonb) from public, authenticated;

-- Универсальный триггер «кто что изменил». Аргумент 'keys_only' — для таблиц с персональными
-- данными: в журнал попадают только названия изменённых полей, без значений.
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_keys_only boolean := tg_nargs > 0 and tg_argv[0] = 'keys_only';
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changed jsonb := '{}'::jsonb;
  v_key text;
  v_id text := coalesce(v_new ->> 'id', v_old ->> 'id',
                        concat_ws(':', coalesce(v_new, v_old) ->> 'manager_id', coalesce(v_new, v_old) ->> 'company_id'));
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at', 'stage_changed_at') and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changed := v_changed || jsonb_build_object(v_key,
          case when v_keys_only then to_jsonb('changed'::text)
               else jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key) end);
      end if;
    end loop;
    if v_changed = '{}'::jsonb then
      return new;
    end if;
  elsif not v_keys_only then
    v_changed := coalesce(v_new, v_old) - 'token_hash';
  end if;

  perform app.audit(lower(tg_op), tg_table_name, v_id, v_changed - 'token_hash');
  return coalesce(new, old);
end;
$$;

create trigger audit_companies after insert or update or delete on public.companies
  for each row execute function app.audit_row();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function app.audit_row();
create trigger audit_manager_companies after insert or delete on public.manager_companies
  for each row execute function app.audit_row();
create trigger audit_invitations after insert or update on public.invitations
  for each row execute function app.audit_row();
create trigger audit_requests after insert or update or delete on public.requests
  for each row execute function app.audit_row('keys_only');
create trigger audit_candidates after insert or update or delete on public.candidates
  for each row execute function app.audit_row('keys_only');
create trigger audit_request_candidates after insert or update or delete on public.request_candidates
  for each row execute function app.audit_row();
create trigger audit_documents after insert or update or delete on public.documents
  for each row execute function app.audit_row();
create trigger audit_services after insert or update or delete on public.services
  for each row execute function app.audit_row();
create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function app.audit_row();

-- ───────────────────────── Этапы кандидата ─────────────────────────

create or replace function app.rc_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.proposed_by := coalesce(new.proposed_by, app.actor_id());
    new.stage_changed_at := now();
    if new.stage = 'interested' or new.client_decision is not null then
      if current_user = 'authenticated' then
        raise exception 'Решение по кандидату принимает только клиент' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- Прямое изменение через API делает только команда (у клиента нет политики UPDATE).
  -- Решения клиента — только через public.client_decide().
  if current_user = 'authenticated' then
    if new.client_decision is distinct from old.client_decision
       or new.client_decided_at is distinct from old.client_decided_at
       or new.client_decided_by is distinct from old.client_decided_by then
      raise exception 'Решение по кандидату принимает только клиент' using errcode = '42501';
    end if;
    if new.stage = 'interested' and old.stage <> 'interested' then
      raise exception 'Этап «Интересен» ставит только клиент' using errcode = '42501';
    end if;
  end if;

  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage <> 'rejected' then
      new.rejection_reason_id := null;
      new.rejection_comment := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger rc_before_write before insert or update on public.request_candidates
  for each row execute function app.rc_before_write();

-- История этапов: строка на каждое предложение и каждую смену этапа.
create or replace function app.rc_write_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stage_history (request_candidate_id, from_stage, to_stage, changed_by)
    values (new.id, null, new.stage, app.actor_id());
  elsif new.stage is distinct from old.stage then
    insert into public.stage_history (request_candidate_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, app.actor_id());
  end if;
  return new;
end;
$$;

create trigger rc_history after insert or update of stage on public.request_candidates
  for each row execute function app.rc_write_history();

-- Статус заявки следует за воронкой: предложены → интервью → закрыта при выходе сотрудника.
-- Приостановленные и отменённые заявки автоматически не трогаются.
create or replace function app.rc_sync_request_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.stage = 'hired' then
    update public.requests
       set status = 'closed', closed_at = coalesce(closed_at, now())
     where id = new.request_id and status not in ('closed', 'cancelled');
  elsif new.stage in ('interview', 'offer') then
    update public.requests set status = 'interview'
     where id = new.request_id and status in ('new', 'search', 'offered');
  else
    update public.requests set status = 'offered'
     where id = new.request_id and status in ('new', 'search');
  end if;
  return new;
end;
$$;

create trigger rc_sync_request after insert or update of stage on public.request_candidates
  for each row execute function app.rc_sync_request_status();

-- ───────────────────────── Решение клиента ─────────────────────────

create or replace function public.client_decide(
  p_request_candidate_id uuid,
  p_decision public.client_decision,
  p_rejection_reason_id int default null,
  p_comment text default null
)
returns public.request_candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rc public.request_candidates;
  v_company uuid := app.current_company_id();
  v_new_stage public.candidate_stage;
begin
  if v_company is null then
    raise exception 'Решения по кандидатам принимает только клиент' using errcode = '42501';
  end if;

  select rc.* into v_rc
  from public.request_candidates rc
  join public.requests r on r.id = rc.request_id
  where rc.id = p_request_candidate_id and r.company_id = v_company
  for update of rc;

  if not found then
    -- Одинаковый ответ для «нет такого» и «чужое»: не раскрываем существование записи.
    raise exception 'Кандидат не найден' using errcode = 'P0002';
  end if;

  if v_rc.stage in ('hired', 'rejected') then
    raise exception 'По этому кандидату решение уже принято' using errcode = 'P0001';
  end if;

  case p_decision
    when 'interested' then
      if v_rc.stage not in ('offered', 'interested') then
        raise exception 'Кандидат уже на этапе «%»', v_rc.stage using errcode = 'P0001';
      end if;
      v_new_stage := 'interested';
    when 'interview' then
      if v_rc.stage not in ('offered', 'interested', 'interview') then
        raise exception 'Кандидат уже на этапе «%»', v_rc.stage using errcode = 'P0001';
      end if;
      v_new_stage := 'interview';
    when 'rejected' then
      if p_rejection_reason_id is null
         or not exists (select 1 from public.rejection_reasons where id = p_rejection_reason_id and is_active) then
        raise exception 'Укажите причину отказа' using errcode = '23514';
      end if;
      v_new_stage := 'rejected';
  end case;

  update public.request_candidates
     set stage = v_new_stage,
         client_decision = p_decision,
         client_decided_at = now(),
         client_decided_by = app.current_user_id(),
         rejection_reason_id = case when p_decision = 'rejected' then p_rejection_reason_id end,
         rejection_comment = case when p_decision = 'rejected' then nullif(trim(p_comment), '') end
   where id = v_rc.id
  returning * into v_rc;

  perform app.audit('client.decision', 'request_candidates', v_rc.id::text,
                    jsonb_build_object('decision', p_decision, 'reason_id', p_rejection_reason_id));
  return v_rc;
end;
$$;

revoke all on function public.client_decide(uuid, public.client_decision, int, text) from public, anon;
grant execute on function public.client_decide(uuid, public.client_decision, int, text) to authenticated;

-- ───────────────────────── Блокировка входа ─────────────────────────

-- До какого момента вход заблокирован для почты или IP (NULL — не заблокирован).
-- Вызывает только сервер (service_role).
create or replace function public.login_locked_until(p_email text, p_ip inet)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_max int := coalesce((select (value #>> '{}')::int from public.settings where key = 'login_max_attempts'), 5);
  v_minutes int := coalesce((select (value #>> '{}')::int from public.settings where key = 'login_lock_minutes'), 15);
  v_window interval := make_interval(mins => v_minutes);
  v_last_fail timestamptz;
begin
  -- Ошибки после последнего успешного входа в окне блокировки.
  select max(created_at) into v_last_fail
  from (
    select created_at
    from public.login_attempts a
    where lower(a.email) = lower(p_email)
      and not a.success
      and a.created_at > now() - v_window
      and a.created_at > coalesce((select max(created_at) from public.login_attempts s
                                   where lower(s.email) = lower(p_email) and s.success), '-infinity')
    order by created_at desc
    limit v_max
  ) f
  having count(*) >= v_max;

  if v_last_fail is not null then
    return v_last_fail + v_window;
  end if;

  -- Перебор многих почт с одного IP: порог в 4 раза выше.
  if p_ip is not null then
    select max(created_at) into v_last_fail
    from (select created_at from public.login_attempts
          where ip = p_ip and not success and created_at > now() - v_window
          order by created_at desc limit v_max * 4) f
    having count(*) >= v_max * 4;
    if v_last_fail is not null then
      return v_last_fail + v_window;
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.login_locked_until(text, inet) from public, anon, authenticated;
grant execute on function public.login_locked_until(text, inet) to service_role;
