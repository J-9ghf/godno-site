-- Формы сайта: резюме кандидата (с объединением дублей) и заявка работодателя.
-- Пишет только сервер (service_role) после проверок: капча, honeypot, лимиты, тип и размер файла.

-- Telegram без «@», «https://t.me/» и регистра — для поиска дублей.
create or replace function app.normalize_telegram(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(trim(coalesce(p, '')), '^(https?://)?(t\.me/|telegram\.me/)?@?', '', 'i')), '');
$$;

alter table public.candidates
  add column telegram_norm text generated always as (app.normalize_telegram(telegram)) stored;
create index candidates_telegram_idx on public.candidates (telegram_norm);

-- Резюме с сайта. Дубль — тот же телефон, Telegram или почта. Дубль не создаёт новую запись:
-- обновляются город, направление, файл, видео и дата согласия, пустые контакты дополняются.
create or replace function public.submit_site_resume(
  p_full_name text,
  p_phone text,
  p_telegram text,
  p_email text,
  p_city text,
  p_position_code text,
  p_resume_path text,
  p_video_url text,
  p_consent_version text
)
returns table (candidate_id uuid, merged boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := app.normalize_phone(p_phone);
  v_tg text := app.normalize_telegram(p_telegram);
  v_email text := lower(nullif(trim(p_email), ''));
  v_id uuid;
begin
  if v_phone is null and v_tg is null and v_email is null then
    raise exception 'Нужен телефон, Telegram или почта' using errcode = '23514';
  end if;

  -- Две одновременные отправки одного человека не создадут две записи.
  perform pg_advisory_xact_lock(hashtext('site_resume:' || coalesce(v_phone, '') || ':' || coalesce(v_tg, '') || ':' || coalesce(v_email, '')));

  select c.id into v_id
  from public.candidates c
  where (v_phone is not null and c.phone_norm = v_phone)
     or (v_tg is not null and c.telegram_norm = v_tg)
     or (v_email is not null and c.email_norm = v_email)
  order by c.created_at
  limit 1
  for update;

  if v_id is null then
    insert into public.candidates (full_name, phone, telegram, email, city, position_code, resume_path, video_url,
                                   source, pool_status, consent_at, consent_version)
    values (trim(p_full_name), nullif(trim(p_phone), ''), nullif(trim(p_telegram), ''), v_email, nullif(trim(p_city), ''),
            p_position_code, p_resume_path, nullif(trim(p_video_url), ''), 'site', 'new', now(), p_consent_version)
    returning id into v_id;
    return query select v_id, false;
  else
    update public.candidates c
       set phone = coalesce(c.phone, nullif(trim(p_phone), '')),
           telegram = coalesce(c.telegram, nullif(trim(p_telegram), '')),
           email = coalesce(c.email, v_email),
           city = coalesce(nullif(trim(p_city), ''), c.city),
           position_code = coalesce(p_position_code, c.position_code),
           resume_path = coalesce(p_resume_path, c.resume_path),
           video_url = coalesce(nullif(trim(p_video_url), ''), c.video_url),
           consent_at = now(),
           consent_version = p_consent_version,
           tags = case when 'повторное резюме' = any (c.tags) then c.tags else array_append(c.tags, 'повторное резюме') end
     where c.id = v_id;
    return query select v_id, true;
  end if;
end;
$$;

revoke all on function public.submit_site_resume(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_site_resume(text, text, text, text, text, text, text, text, text) to service_role;

-- Позиции для форм сайта читает сервер; анониму доступ не нужен.
