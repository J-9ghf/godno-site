-- Что видит клиент и как считаются показатели.
--
-- Представления client_* принадлежат владельцу схемы и отдают только разрешённые поля и только
-- по действующим представлениям компаний текущего пользователя. Клиент получает ID представления,
-- но не ID кандидата и не ID файлов: так два клиента не могут сопоставить данные одного кандидата.

create view client_presentations with (security_barrier = true) as
select p.id as presentation_id,
       v.id as vacancy_id, v.title as vacancy_title, v.company_id,
       a.stage,
       case when a.stage = 'rejected' then a.reject_reason end as reject_reason,
       p.presented_at, p.client_comment, p.analysis,
       c.full_name,
       case when c.birth_year is not null then extract(year from now())::int - c.birth_year end as age,
       c.city, c.direction, c.experience_summary, c.salary_expectation,
       case when p.can_view_contacts then c.phone end as phone,
       case when p.can_view_contacts then c.email end as email,
       case when p.can_view_contacts then c.telegram end as telegram,
       p.can_view_resume,
       (p.can_view_resume and p.can_download_resume) as can_download_resume,
       p.can_view_video, p.can_view_contacts,
       (p.can_view_resume and exists (select 1 from files f where f.candidate_id = c.id and f.kind = 'resume_pdf' and f.deleted_at is null)) as has_resume,
       (select max(h.changed_at) from stage_history h where h.application_id = a.id) as stage_changed_at
  from presentations p
  join applications a on a.id = p.application_id
  join vacancies v on v.id = a.vacancy_id
  join candidates c on c.id = a.candidate_id
 where p.revoked_at is null
   and c.anonymized_at is null
   and v.company_id = any(app_company_ids())
   and exists (select 1 from consents k where k.id = p.consent_id and k.withdrawn_at is null);

-- История этапов: только с момента представления и без внутренних этапов
create view client_stage_history with (security_barrier = true) as
select cp.presentation_id, h.to_stage, h.changed_at,
       case when h.to_stage = 'rejected' then h.reason end as reason,
       case when exists (select 1 from company_members m where m.user_id = h.changed_by and m.company_id = cp.company_id)
            then 'client' else 'agency' end as actor_side,
       case when exists (select 1 from company_members m where m.user_id = h.changed_by and m.company_id = cp.company_id)
            then (select u.name from "user" u where u.id = h.changed_by) end as actor_name,
       h.on_behalf_of_client
  from client_presentations cp
  join presentations p on p.id = cp.presentation_id
  join stage_history h on h.application_id = p.application_id
 where h.changed_at >= p.presented_at
   and h.to_stage not in ('sourced','screening');

-- Ссылки на видео и Яндекс Диск: только если разрешено в представлении
create view client_presentation_links with (security_barrier = true) as
select cp.presentation_id, l.kind, l.title, l.url
  from client_presentations cp
  join presentations p on p.id = cp.presentation_id
  join applications a on a.id = p.application_id
  join candidate_links l on l.candidate_id = a.candidate_id
 where p.can_view_video and l.kind in ('video','yandex_disk');

grant select on client_presentations, client_stage_history, client_presentation_links to ikr_app;

-- Отзыв клиента всегда привязан к рассмотрению своего представления
create function client_feedback_fill() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select application_id into new.application_id from presentations where id = new.presentation_id;
  return new;
end $$;
create trigger client_feedback_fill before insert on client_feedback for each row execute function client_feedback_fill();

-- Решение клиента по кандидату. Коды ошибок: IK404 не найдено, IK403 нет права, IK409 недопустимый переход, IK422 нет причины.
create function client_set_stage(pid uuid, p_to text, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare cid uuid; app applications; allowed text[];
begin
  cid := presentation_company(pid);
  if cid is null or not (cid = any(app_company_ids()))
     or not exists (select 1 from client_presentations where presentation_id = pid) then
    raise exception 'not_found' using errcode = 'IK404';
  end if;
  if not app_can_act(cid) then raise exception 'forbidden' using errcode = 'IK403'; end if;
  select a.* into app from presentations p join applications a on a.id = p.application_id where p.id = pid for update of a;
  allowed := case app.stage
    when 'offered' then array['interested','interview','rejected']
    when 'interested' then array['interview','rejected']
    when 'interview' then array['rejected']
    when 'offer' then array['rejected']
    else array[]::text[] end;
  if not (p_to = any(allowed)) then raise exception 'transition' using errcode = 'IK409'; end if;
  if p_to = 'rejected' and coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = 'IK422'; end if;
  perform set_config('app.stage_reason', coalesce(left(p_reason, 500), ''), true);
  update applications set stage = p_to, reject_reason = case when p_to = 'rejected' then left(p_reason, 500) end where id = app.id;
  perform set_config('app.stage_reason', '', true);
  insert into audit_log(actor_id, action, entity_type, entity_id, company_id, details)
  values (app_uid(), 'client.decision', 'presentation', pid::text, cid, jsonb_build_object('from', app.stage, 'to', p_to));
  return p_to;
end $$;

-- Резюме по представлению: проверка прав при каждом запросе. download = true требует разрешения на скачивание.
create function client_resume(pid uuid, p_download boolean)
returns table (storage_key text, mime text, original_name text, size_bytes bigint, page_count integer)
language plpgsql security definer set search_path = public as $$
declare cp client_presentations;
begin
  select * into cp from client_presentations where presentation_id = pid;
  if cp.presentation_id is null or not cp.can_view_resume then raise exception 'not_found' using errcode = 'IK404'; end if;
  if p_download and not cp.can_download_resume then raise exception 'forbidden' using errcode = 'IK403'; end if;
  return query
    select f.storage_key, f.mime, f.original_name, f.size_bytes, f.page_count
      from presentations p join applications a on a.id = p.application_id
      join files f on f.candidate_id = a.candidate_id
     where p.id = pid and f.kind = 'resume_pdf' and f.deleted_at is null and f.scan_status <> 'infected'
     order by f.created_at desc limit 1;
  if not found then raise exception 'not_found' using errcode = 'IK404'; end if;
end $$;

revoke all on function client_set_stage(uuid, text, text), client_resume(uuid, boolean) from public;
grant execute on function client_set_stage(uuid, text, text), client_resume(uuid, boolean) to ikr_app;

-- ---------- Показатели ----------
-- Одна функция для администратора и клиента. Клиенту компании принудительно ограничиваются его
-- собственными, а в расчёт идут только действующие представления.
--
-- Правила:
--   active_vacancies       вакансии не в статусах paused, closed, cancelled (без учёта периода)
--   processed_candidates   уникальные кандидаты, добавленные к вакансиям за период, на любом этапе
--   presented              представления (кандидат × вакансия), впервые сделанные в периоде (когорта)
--   presented_unique       уникальные кандидаты в этой когорте
--   awaiting_client        текущий этап offered
--   in_progress            текущий этап interested или interview
--   current_interview      текущий этап interview (до модуля расписания интервью)
--   reached_*              дошли до этапа или дальше после представления (по stage_history)
--   conversions            доля перешедших между соседними этапами внутри когорты
--   avg_days_to_first      среднее по вакансиям: первое представление минус открытие вакансии
--   avg_days_to_hire       среднее по вакансиям с наймом: первый выход минус открытие вакансии
create function metrics(p_company_ids uuid[], p_vacancy uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare admin boolean := app_is_admin(); comps uuid[]; result jsonb;
begin
  if admin then
    comps := coalesce(p_company_ids, array(select id from companies));
  else
    comps := array(select unnest(coalesce(p_company_ids, app_company_ids())) intersect select unnest(app_company_ids()));
  end if;

  with vac as (
    select * from vacancies where company_id = any(comps) and (p_vacancy is null or id = p_vacancy)
  ), apps as (
    select a.* from applications a join vac on vac.id = a.vacancy_id
  ), pres as (
    select a.id as app_id, a.candidate_id, a.vacancy_id, a.stage, a.reject_reason,
           min(p.presented_at) as first_presented, bool_or(p.revoked_at is null) as active
      from apps a join presentations p on p.application_id = a.id
     group by a.id, a.candidate_id, a.vacancy_id, a.stage, a.reject_reason
  ), cohort as (
    select pr.*,
      exists (select 1 from stage_history h where h.application_id = pr.app_id and h.changed_at >= pr.first_presented and h.to_stage in ('interested','interview','offer','hired')) as r_interested,
      exists (select 1 from stage_history h where h.application_id = pr.app_id and h.changed_at >= pr.first_presented and h.to_stage in ('interview','offer','hired')) as r_interview,
      exists (select 1 from stage_history h where h.application_id = pr.app_id and h.changed_at >= pr.first_presented and h.to_stage in ('offer','hired')) as r_offer,
      exists (select 1 from stage_history h where h.application_id = pr.app_id and h.changed_at >= pr.first_presented and h.to_stage = 'hired') as r_hired
      from pres pr
     where (admin or pr.active)
       and (p_from is null or pr.first_presented >= p_from)
       and (p_to is null or pr.first_presented < p_to)
  ), agg as (
    select count(*) as presented, count(distinct candidate_id) as presented_unique,
           count(*) filter (where stage = 'offered' and active) as awaiting_client,
           count(*) filter (where stage in ('interested','interview') and active) as in_progress,
           count(*) filter (where stage = 'interview' and active) as current_interview,
           count(*) filter (where r_interested) as reached_interested,
           count(*) filter (where r_interview) as reached_interview,
           count(*) filter (where r_offer) as reached_offer,
           count(*) filter (where r_hired) as reached_hired,
           count(*) filter (where stage = 'rejected') as rejected,
           count(*) filter (where not active) as revoked
      from cohort
  ), firsts as (
    select vac.id, vac.opened_at,
           (select min(p.presented_at) from apps a join presentations p on p.application_id = a.id where a.vacancy_id = vac.id) as first_presented,
           (select min(h.changed_at) from apps a join stage_history h on h.application_id = a.id where a.vacancy_id = vac.id and h.to_stage = 'hired') as first_hired
      from vac
  )
  select jsonb_build_object(
    'active_vacancies', (select count(*) from vac where status not in ('paused','closed','cancelled')),
    'processed_candidates', (select count(distinct candidate_id) from apps
                              where (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to)),
    'presented', agg.presented,
    'presented_unique', agg.presented_unique,
    'awaiting_client', agg.awaiting_client,
    'in_progress', agg.in_progress,
    'current_interview', agg.current_interview,
    'reached_interested', agg.reached_interested,
    'reached_interview', agg.reached_interview,
    'reached_offer', agg.reached_offer,
    'reached_hired', agg.reached_hired,
    'rejected', agg.rejected,
    'revoked', case when admin then agg.revoked else 0 end,
    'conversions', jsonb_build_object(
      'offered_to_interested', case when agg.presented > 0 then round(100.0 * agg.reached_interested / agg.presented) end,
      'interested_to_interview', case when agg.reached_interested > 0 then round(100.0 * agg.reached_interview / agg.reached_interested) end,
      'interview_to_offer', case when agg.reached_interview > 0 then round(100.0 * agg.reached_offer / agg.reached_interview) end,
      'offer_to_hired', case when agg.reached_offer > 0 then round(100.0 * agg.reached_hired / agg.reached_offer) end),
    'reject_reasons', coalesce((select jsonb_agg(jsonb_build_object('reason', r, 'count', n) order by n desc)
                                  from (select coalesce(split_part(reject_reason, ':', 1), 'Без причины') as r, count(*) as n
                                          from cohort where stage = 'rejected' group by 1) x), '[]'::jsonb),
    'avg_days_to_first', (select round(avg(extract(epoch from first_presented - opened_at) / 86400)::numeric, 1) from firsts where first_presented is not null),
    'avg_days_to_hire', (select round(avg(extract(epoch from first_hired - opened_at) / 86400)::numeric, 1) from firsts where first_hired is not null)
  ) into result from agg;
  return result;
end $$;
revoke all on function metrics(uuid[], uuid, timestamptz, timestamptz) from public;
grant execute on function metrics(uuid[], uuid, timestamptz, timestamptz) to ikr_app;
