-- Этап 6.
-- 1) Двухфакторная аутентификация (плагин twoFactor Better Auth 1.7.7; схема сгенерирована библиотекой).
-- 2) Явный выбор файла резюме в представлении: загрузка нового файла ничего не открывает клиенту.
-- 3) Результат проверки PDF на активное содержимое.

alter table "user" add column "twoFactorEnabled" boolean default false;
create table "twoFactor" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "user" ("id") on delete cascade, "verified" boolean, "failedVerificationCount" integer, "lockedUntil" timestamptz);
create index "twoFactor_secret_idx" on "twoFactor" ("secret");
create index "twoFactor_userId_idx" on "twoFactor" ("userId");
grant select, insert, update, delete on "twoFactor" to ikr_app;

-- ---------- Явный выбор резюме ----------
alter table presentations add column resume_file_id uuid references files(id);
-- Существующие (только тестовые) представления с правом просмотра получают последний загруженный на момент миграции файл
update presentations p set resume_file_id = (
  select f.id from applications a join files f on f.candidate_id = a.candidate_id
   where a.id = p.application_id and f.kind = 'resume_pdf' and f.deleted_at is null order by f.created_at desc limit 1)
 where p.can_view_resume;
update presentations set can_view_resume = false, can_download_resume = false where can_view_resume and resume_file_id is null;
alter table presentations add constraint presentations_resume_file_required check (not can_view_resume or resume_file_id is not null);

create function presentations_check_file() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.resume_file_id is not null and not exists (
      select 1 from files f join applications a on a.candidate_id = f.candidate_id
       where f.id = new.resume_file_id and a.id = new.application_id and f.kind = 'resume_pdf' and f.deleted_at is null) then
    raise exception 'Файл резюме не принадлежит кандидату или удалён' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger presentations_file_guard before insert or update of resume_file_id on presentations for each row execute function presentations_check_file();

-- ---------- Проверка содержимого ----------
alter table files add column content_flags text[] not null default '{}';   -- найденное активное содержимое (для отчёта)
alter table files add column scanned_at timestamptz;

-- ---------- Представления клиента: резюме только явно выбранное ----------
create or replace view client_presentations with (security_barrier = true) as
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
       (p.can_view_resume and exists (select 1 from files f where f.id = p.resume_file_id and f.deleted_at is null and f.scan_status <> 'infected')) as has_resume,
       (select max(h.changed_at) from stage_history h where h.application_id = a.id) as stage_changed_at
  from presentations p
  join applications a on a.id = p.application_id
  join vacancies v on v.id = a.vacancy_id
  join candidates c on c.id = a.candidate_id
 where p.revoked_at is null
   and c.anonymized_at is null
   and v.company_id = any(app_company_ids())
   and exists (select 1 from consents k where k.id = p.consent_id and k.withdrawn_at is null);

create or replace function client_resume(pid uuid, p_download boolean)
returns table (storage_key text, mime text, original_name text, size_bytes bigint, page_count integer)
language plpgsql security definer set search_path = public as $$
declare cp client_presentations;
begin
  select * into cp from client_presentations where presentation_id = pid;
  if cp.presentation_id is null or not cp.can_view_resume then raise exception 'not_found' using errcode = 'IK404'; end if;
  if p_download and not cp.can_download_resume then raise exception 'forbidden' using errcode = 'IK403'; end if;
  return query
    select f.storage_key, f.mime, f.original_name, f.size_bytes, f.page_count
      from presentations p join files f on f.id = p.resume_file_id
     where p.id = pid and f.kind = 'resume_pdf' and f.deleted_at is null and f.scan_status <> 'infected';
  if not found then raise exception 'not_found' using errcode = 'IK404'; end if;
end $$;
