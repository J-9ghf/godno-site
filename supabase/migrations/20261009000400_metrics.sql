-- Показатели — только SQL-представления. Фронт ничего не считает.
--
-- Все представления с security_invoker = true: RLS таблиц действует и здесь,
-- поэтому клиент получает цифры только по своей компании, менеджер — по своим клиентам.
--
-- «Дошёл до этапа X» = в истории этапов есть переход на X или дальше (кроме «Отказ»).
-- Так кандидат, получивший отказ после интервью, учитывается в «дошли до интервью».

create view public.v_request_candidate_progress
with (security_invoker = true) as
select
  rc.id as request_candidate_id,
  rc.request_id,
  r.company_id,
  rc.stage,
  max(h.to_stage) filter (where h.to_stage <> 'rejected') as max_stage,
  min(h.changed_at) as offered_at,
  min(h.changed_at) filter (where h.to_stage = 'hired') as hired_at
from public.request_candidates rc
join public.requests r on r.id = rc.request_id
left join public.stage_history h on h.request_candidate_id = rc.id
group by rc.id, rc.request_id, r.company_id, rc.stage;

create view public.v_request_metrics
with (security_invoker = true) as
with g as (
  select coalesce((select (value #>> '{}')::int from public.settings where key = 'guarantee_days'), 60) as days
)
select
  r.id as request_id,
  r.company_id,
  r.title,
  r.position_code,
  r.status,
  r.source,
  r.assigned_manager_id,
  r.created_at,
  r.closed_at,
  count(p.request_candidate_id)::int as offered,
  count(*) filter (where p.max_stage >= 'interested')::int as interested,
  count(*) filter (where p.max_stage >= 'interview')::int as interview,
  count(*) filter (where p.max_stage >= 'offer')::int as offer,
  count(*) filter (where p.max_stage = 'hired')::int as hired,
  count(*) filter (where p.stage = 'rejected')::int as rejected,
  count(*) filter (where p.stage = 'offered')::int as awaiting_decision,
  min(p.offered_at) as first_offered_at,
  min(p.hired_at) as hired_at,
  round(extract(epoch from (min(p.offered_at) - r.created_at)) / 86400.0, 1) as days_to_first_candidate,
  round(extract(epoch from (min(p.hired_at) - r.created_at)) / 86400.0, 1) as days_to_close,
  floor(extract(epoch from (coalesce(r.closed_at, now()) - r.created_at)) / 86400.0)::int as days_in_work,
  (min(p.hired_at) + make_interval(days => (select days from g))) as guarantee_until,
  coalesce(min(p.hired_at) + make_interval(days => (select days from g)) > now(), false) as in_guarantee
from public.requests r
left join public.v_request_candidate_progress p on p.request_id = r.id
group by r.id;

create view public.v_company_metrics
with (security_invoker = true) as
select
  c.id as company_id,
  c.name as company_name,
  count(m.request_id) filter (where m.status not in ('closed', 'cancelled'))::int as requests_in_work,
  count(m.request_id) filter (where m.status = 'closed')::int as requests_closed,
  count(m.request_id)::int as requests_total,
  coalesce(sum(m.offered), 0)::int as offered,
  coalesce(sum(m.interested), 0)::int as interested,
  coalesce(sum(m.interview), 0)::int as interview,
  coalesce(sum(m.offer), 0)::int as offer,
  coalesce(sum(m.hired), 0)::int as hired,
  coalesce(sum(m.rejected), 0)::int as rejected,
  coalesce(sum(m.awaiting_decision), 0)::int as awaiting_decision,
  -- Конверсии в процентах; NULL, если делить не на что.
  round(100.0 * sum(m.interested) / nullif(sum(m.offered), 0), 1) as pct_interest,
  round(100.0 * sum(m.interview) / nullif(sum(m.offered), 0), 1) as pct_interview,
  round(100.0 * sum(m.interview) / nullif(sum(m.interested), 0), 1) as pct_interest_to_interview,
  round(100.0 * sum(m.offer) / nullif(sum(m.interview), 0), 1) as pct_interview_to_offer,
  round(100.0 * sum(m.hired) / nullif(sum(m.offer), 0), 1) as pct_offer_to_hire,
  round(avg(m.days_to_first_candidate), 1) as avg_days_to_first_candidate,
  round(avg(m.days_to_close), 1) as avg_days_to_close
from public.companies c
left join public.v_request_metrics m on m.company_id = c.id
group by c.id, c.name;

-- Причины отказов: по компании и по заявке.
create view public.v_rejection_reasons
with (security_invoker = true) as
select
  r.company_id,
  rr.id as reason_id,
  rr.label as reason,
  count(*)::int as count
from public.request_candidates rc
join public.requests r on r.id = rc.request_id
join public.rejection_reasons rr on rr.id = rc.rejection_reason_id
where rc.stage = 'rejected'
group by r.company_id, rr.id, rr.label;

create view public.v_request_rejection_reasons
with (security_invoker = true) as
select
  rc.request_id,
  r.company_id,
  rr.id as reason_id,
  rr.label as reason,
  count(*)::int as count
from public.request_candidates rc
join public.requests r on r.id = rc.request_id
join public.rejection_reasons rr on rr.id = rc.rejection_reason_id
where rc.stage = 'rejected'
group by rc.request_id, r.company_id, rr.id, rr.label;

-- ───────────────────────── Кандидаты глазами клиента ─────────────────────────
-- Единственный способ клиенту увидеть кандидата. Представление выполняется с правами
-- владельца (security_invoker = false), поэтому строки ограничены явно: только кандидаты,
-- предложенные по заявкам компании текущего клиента. Телефона, почты, Telegram,
-- путей к файлам и внутренних заметок здесь нет: файлы отдаёт сервер по временной ссылке.

create view public.client_candidates
with (security_invoker = false, security_barrier = true) as
select
  rc.id as request_candidate_id,
  rc.request_id,
  r.title as request_title,
  r.company_id,
  rc.candidate_id,
  c.full_name,
  c.city,
  c.position_code,
  c.summary,
  c.video_url,
  (c.video_path is not null) as has_video_file,
  (c.resume_path is not null) as has_resume,
  rc.stage,
  rc.client_decision,
  rc.client_decided_at,
  rc.rejection_reason_id,
  rc.rejection_comment,
  rc.recruiter_comment,
  rc.proposed_at,
  rc.stage_changed_at
from public.request_candidates rc
join public.requests r on r.id = rc.request_id
join public.candidates c on c.id = rc.candidate_id
where r.company_id = app.current_company_id();

revoke all on public.v_request_candidate_progress, public.v_request_metrics, public.v_company_metrics,
              public.v_rejection_reasons, public.v_request_rejection_reasons, public.client_candidates
  from anon;
revoke insert, update, delete, truncate on public.v_request_candidate_progress, public.v_request_metrics,
              public.v_company_metrics, public.v_rejection_reasons, public.v_request_rejection_reasons,
              public.client_candidates
  from authenticated;
grant select on public.v_request_candidate_progress, public.v_request_metrics, public.v_company_metrics,
                public.v_rejection_reasons, public.v_request_rejection_reasons, public.client_candidates
  to authenticated;
