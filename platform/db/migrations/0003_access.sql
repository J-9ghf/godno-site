-- Права доступа на уровне базы (второй рубеж после проверок сервера).
--
-- Сервер в каждой транзакции передаёт только ID пользователя: set_config('app.user_id', ..., true).
-- Роль и компании база вычисляет сама по staff_roles и company_members, поэтому блокировка
-- пользователя и отзыв членства действуют сразу, даже если сервер ошибётся.
--
-- Клиенты читают кандидатов, представления и историю только через представления (views) и функции
-- из 0004: они отдают лишь разрешённые поля. Прямого доступа к этим таблицам у клиента нет.
--
-- Служебные таблицы входа ("user", session, account, verification, "rateLimit", user_security,
-- invitations, login_throttle) без RLS: к ним обращается только серверный код входа и приглашений.

create function app_uid() returns text language sql stable as
$$ select nullif(current_setting('app.user_id', true), '') $$;

create function app_user_active() returns boolean language sql stable security definer set search_path = public as $$
  select app_uid() is not null
     and exists (select 1 from "user" u where u.id = app_uid())
     and not exists (select 1 from user_security s where s.user_id = app_uid() and s.is_blocked)
$$;

create function app_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select app_user_active() and exists (select 1 from staff_roles r where r.user_id = app_uid() and r.role = 'admin')
$$;

-- Компании, к которым у пользователя есть действующий доступ
create function app_company_ids() returns uuid[] language sql stable security definer set search_path = public as $$
  select case when not app_user_active() then '{}'::uuid[] else coalesce(array(
    select m.company_id from company_members m join companies c on c.id = m.company_id
     where m.user_id = app_uid() and m.revoked_at is null and c.status <> 'archived'), '{}') end
$$;

-- Может ли пользователь принимать решения и оставлять отзывы в компании (owner, member)
create function app_can_act(cid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app_user_active() and exists (select 1 from company_members m join companies c on c.id = m.company_id
     where m.user_id = app_uid() and m.company_id = cid and m.revoked_at is null and c.status <> 'archived'
       and m.role in ('owner','member'))
$$;

revoke all on function app_user_active(), app_is_admin(), app_company_ids(), app_can_act(uuid) from public;
grant execute on function app_uid(), app_user_active(), app_is_admin(), app_company_ids(), app_can_act(uuid) to ikr_app;

-- ---------- RLS ----------
alter table companies enable row level security;
create policy companies_admin on companies for all using (app_is_admin()) with check (app_is_admin());
create policy companies_client_read on companies for select using (id = any(app_company_ids()));

alter table vacancies enable row level security;
create policy vacancies_admin on vacancies for all using (app_is_admin()) with check (app_is_admin());
create policy vacancies_client_read on vacancies for select using (company_id = any(app_company_ids()));

alter table company_members enable row level security;
create policy members_admin on company_members for all using (app_is_admin()) with check (app_is_admin());
create policy members_client_read on company_members for select using (company_id = any(app_company_ids()));

alter table staff_roles enable row level security;
create policy staff_admin on staff_roles for all using (app_is_admin()) with check (app_is_admin());
create policy staff_self on staff_roles for select using (user_id = app_uid());

alter table staff_assignments enable row level security;
create policy assignments_admin on staff_assignments for all using (app_is_admin()) with check (app_is_admin());

-- Только администратор: пул кандидатов, ссылки, файлы, согласия, рассмотрения, представления, история, заметки
do $$ declare t text; begin
  foreach t in array array['candidates','candidate_links','files','consent_texts','consents','applications',
                           'presentations','stage_history','internal_notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (app_is_admin()) with check (app_is_admin())', t || '_admin', t);
  end loop;
end $$;

-- Обратная связь: клиент видит и пишет только по своим действующим представлениям
alter table client_feedback enable row level security;
create policy feedback_admin on client_feedback for all using (app_is_admin()) with check (app_is_admin());
create function presentation_company(pid uuid) returns uuid language sql stable security definer set search_path = public as $$
  select v.company_id from presentations p join applications a on a.id = p.application_id join vacancies v on v.id = a.vacancy_id
   where p.id = pid and p.revoked_at is null
$$;
revoke all on function presentation_company(uuid) from public;
grant execute on function presentation_company(uuid) to ikr_app;
create policy feedback_client_read on client_feedback for select
  using (presentation_company(presentation_id) = any(app_company_ids()));
create policy feedback_client_write on client_feedback for insert
  with check (author_id = app_uid() and app_can_act(presentation_company(presentation_id)));

alter table audit_log enable row level security;
create policy audit_admin_read on audit_log for select using (app_is_admin());
create policy audit_insert on audit_log for insert with check (actor_id is not distinct from app_uid() or actor_kind <> 'user');

alter table settings enable row level security;
create policy settings_read on settings for select using (true);
create policy settings_admin on settings for update using (app_is_admin()) with check (app_is_admin());

-- ---------- Целостность ----------
-- История этапов и журнал нельзя изменить даже владельцу таблиц случайным запросом
create function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'Таблица % только пополняется', tg_table_name; end $$;
create trigger stage_history_immutable before update or delete on stage_history for each row execute function forbid_change();
create trigger audit_log_immutable before update or delete on audit_log for each row execute function forbid_change();

-- Каждая смена этапа попадает в историю. Причина и отметка «за клиента» передаются настройками транзакции.
create function applications_track_stage() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into stage_history(application_id, from_stage, to_stage, changed_by, reason, on_behalf_of_client)
    values (new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage, app_uid(),
            nullif(current_setting('app.stage_reason', true), ''),
            coalesce(nullif(current_setting('app.on_behalf', true), ''), 'false')::boolean);
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger applications_stage_ins after insert on applications for each row execute function applications_track_stage();
create trigger applications_stage_upd before update of stage on applications for each row execute function applications_track_stage();

-- Видимые клиенту этапы возможны только после представления
create function applications_check_stage() returns trigger language plpgsql as $$
begin
  if new.stage in ('offered','interested','interview','offer','hired')
     and not exists (select 1 from presentations p where p.application_id = new.id) then
    raise exception 'Этап % возможен только после представления кандидата клиенту', new.stage using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger applications_stage_guard before insert or update of stage on applications for each row execute function applications_check_stage();

-- Представление требует действующего согласия на передачу работодателю, подходящего этой компании
create function presentations_check_consent() returns trigger language plpgsql security definer set search_path = public as $$
declare c consents; a applications; cid uuid;
begin
  select * into a from applications where id = new.application_id;
  select v.company_id into cid from vacancies v where v.id = a.vacancy_id;
  select * into c from consents where id = new.consent_id;
  if c.id is null or c.candidate_id <> a.candidate_id or c.purpose <> 'transfer_to_employer'
     or c.withdrawn_at is not null or (c.scope_company_id is not null and c.scope_company_id <> cid) then
    raise exception 'Нет действующего согласия кандидата на передачу данных этому работодателю' using errcode = 'P0002';
  end if;
  if exists (select 1 from candidates where id = a.candidate_id and anonymized_at is not null) then
    raise exception 'Данные кандидата обезличены' using errcode = 'P0002';
  end if;
  return new;
end $$;
create trigger presentations_consent_guard before insert on presentations for each row execute function presentations_check_consent();

-- Отзыв согласия сразу закрывает доступ клиентам
create function consents_on_withdraw() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    if new.purpose = 'transfer_to_employer' then
      update presentations set revoked_at = now(), revoked_reason = 'consent_withdrawn', revoked_by = app_uid()
       where consent_id = new.id and revoked_at is null;
    elsif new.purpose = 'pool_storage' then
      update presentations p set revoked_at = now(), revoked_reason = 'consent_withdrawn', revoked_by = app_uid()
        from applications a where a.id = p.application_id and a.candidate_id = new.candidate_id and p.revoked_at is null;
    elsif new.purpose = 'video_photo' then
      update presentations p set can_view_video = false
        from applications a where a.id = p.application_id and a.candidate_id = new.candidate_id;
    end if;
    insert into audit_log(actor_id, actor_kind, action, entity_type, entity_id, details)
    values (app_uid(), case when app_uid() is null then 'system' else 'user' end, 'consent.withdrawn', 'consent', new.id::text,
            jsonb_build_object('purpose', new.purpose, 'candidate_id', new.candidate_id));
  end if;
  return new;
end $$;
create trigger consents_withdraw after update of withdrawn_at on consents for each row execute function consents_on_withdraw();

-- Выдача доступа по приглашению. Единственный путь записи ролей и членства без администратора в сессии:
-- работает только для действующего неиспользованного приглашения и только для пользователя с той же почтой.
create function grant_invitation(p_invitation uuid, p_user text) returns void
language plpgsql security definer set search_path = public as $$
declare inv invitations;
begin
  select * into inv from invitations where id = p_invitation and accepted_at is null and revoked_at is null and expires_at > now() for update;
  if not found then raise exception 'not_found' using errcode = 'IK404'; end if;
  if (select email from "user" where id = p_user) is distinct from inv.email then raise exception 'forbidden' using errcode = 'IK403'; end if;
  if inv.staff_role is not null then
    insert into staff_roles(user_id, role, created_by) values (p_user, inv.staff_role, inv.created_by)
      on conflict (user_id) do update set role = excluded.role;
  else
    insert into company_members(company_id, user_id, role, created_by) values (inv.company_id, p_user, inv.member_role, inv.created_by)
      on conflict (company_id, user_id) do update set role = excluded.role, revoked_at = null, revoked_by = null;
  end if;
  update invitations set accepted_at = now(), accepted_user_id = p_user where id = inv.id;
end $$;
revoke all on function grant_invitation(uuid, text) from public;
grant execute on function grant_invitation(uuid, text) to ikr_app;
