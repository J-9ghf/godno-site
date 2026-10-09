-- Демо-данные. Только вымышленные люди и компании, почты на example.com.
-- Запускается после миграций (supabase db reset или scripts/db/test.sh).
--
-- Пользователи создаются прямо в auth.users с фиксированными id и общим демо-паролем
-- IkrDemo-2026! (только для локальной разработки и демо-проекта; в рабочей базе демо-данных нет).
-- Служебные строковые поля Auth заполняются '' — с NULL сервис Auth не может прочитать пользователя.
--
--   admin    a0000000-0000-4000-8000-000000000001  admin@example.com
--   manager1 b0000000-0000-4000-8000-000000000001  manager1@example.com  → Альфа
--   manager2 b0000000-0000-4000-8000-000000000002  manager2@example.com  → Бета
--   client A c1000000-0000-4000-8000-000000000001  alfa.lead@example.com (руководитель)
--   client A c1000000-0000-4000-8000-000000000002  alfa.hr@example.com
--   client B c2000000-0000-4000-8000-000000000001  beta.lead@example.com (руководитель)

insert into auth.users (instance_id, id, email, aud, role, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
                        email_change_token_new, email_change_token_current, email_change, phone_change,
                        phone_change_token, reauthentication_token, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, u.email, 'authenticated', 'authenticated',
       extensions.crypt('IkrDemo-2026!', extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, '', '', '', '', '', '', '', '', now(), now()
from (values
  ('a0000000-0000-4000-8000-000000000001', 'admin@example.com'),
  ('b0000000-0000-4000-8000-000000000001', 'manager1@example.com'),
  ('b0000000-0000-4000-8000-000000000002', 'manager2@example.com'),
  ('c1000000-0000-4000-8000-000000000001', 'alfa.lead@example.com'),
  ('c1000000-0000-4000-8000-000000000002', 'alfa.hr@example.com'),
  ('c2000000-0000-4000-8000-000000000001', 'beta.lead@example.com')
) as u (id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, contact_name, contact_email, contact_phone) values
  ('aa000000-0000-4000-8000-000000000001', 'Демо-компания «Альфа»', 'Анна Альфова', 'alfa.lead@example.com', '+7 900 000-01-01'),
  ('bb000000-0000-4000-8000-000000000001', 'Демо-семья «Бета»', 'Борис Бетов', 'beta.lead@example.com', '+7 900 000-02-01');

insert into public.profiles (id, email, full_name, role, company_id, is_company_lead) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@example.com', 'Администратор Демо', 'admin', null, false),
  ('b0000000-0000-4000-8000-000000000001', 'manager1@example.com', 'Мария Менеджерова', 'manager', null, false),
  ('b0000000-0000-4000-8000-000000000002', 'manager2@example.com', 'Михаил Менеджеров', 'manager', null, false),
  ('c1000000-0000-4000-8000-000000000001', 'alfa.lead@example.com', 'Анна Альфова', 'client', 'aa000000-0000-4000-8000-000000000001', true),
  ('c1000000-0000-4000-8000-000000000002', 'alfa.hr@example.com', 'Алексей Альфин', 'client', 'aa000000-0000-4000-8000-000000000001', false),
  ('c2000000-0000-4000-8000-000000000001', 'beta.lead@example.com', 'Борис Бетов', 'client', 'bb000000-0000-4000-8000-000000000001', true);

insert into public.manager_companies (manager_id, company_id, is_primary) values
  ('b0000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', true),
  ('b0000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000001', true);

-- Заявки. Даты создания сдвинуты в прошлое, чтобы сроки на дашбордах были ненулевыми.
insert into public.requests (id, company_id, title, position_code, requirements, budget, status, source,
                             assigned_manager_id, created_at) values
  ('a1000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001',
   'Бизнес-ассистент собственника', 'assistant', 'Опыт от 3 лет, деловая переписка, планирование', 'до 150 000 ₽',
   'search', 'manager', 'b0000000-0000-4000-8000-000000000001', now() - interval '20 days'),
  ('a1000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001',
   'Операционный директор', 'key_employee', 'Опыт управления командой от 10 человек', 'по договорённости',
   'search', 'manager', 'b0000000-0000-4000-8000-000000000001', now() - interval '45 days'),
  ('b1000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001',
   'Няня для ребёнка 2 лет', 'nanny', 'Пятидневка, рекомендации', 'до 90 000 ₽',
   'search', 'manager', 'b0000000-0000-4000-8000-000000000002', now() - interval '12 days');

-- Входящая заявка с сайта: ещё без компании.
insert into public.requests (id, company_id, title, position_code, requirements, status, source,
                             contact_name, contact_phone, contact_company, consent_at, created_at) values
  ('f0000000-0000-4000-8000-000000000001', null, '', 'cook', 'Ищем повара для семьи, пробовали через знакомых',
   'new', 'site', 'Вера Вымышленная', '+7 900 000-09-09', null, now() - interval '1 day', now() - interval '1 day');

-- Пул кандидатов.
insert into public.candidates (id, full_name, phone, telegram, email, city, position_code, summary, video_url,
                               source, pool_status, consent_at, consent_version) values
  ('ca000000-0000-4000-8000-000000000001', 'Ирина Демонстрова', '+7 900 100-00-01', null, 'irina@example.com', 'Москва', 'assistant',
   'Пять лет ассистентом собственника в девелопменте. Сильна в планировании.', 'https://disk.yandex.ru/i/demo-video-1', 'manager', 'in_work', null, null),
  ('ca000000-0000-4000-8000-000000000002', 'Ольга Примерова', '+7 900 100-00-02', '@olga_demo', null, 'Москва', 'assistant',
   'Работала с двумя руководителями одновременно, спокойна под нагрузкой.', null, 'site', 'in_work', now() - interval '30 days', 'demo-v1'),
  ('ca000000-0000-4000-8000-000000000003', 'Пётр Тестов', '+7 900 100-00-03', null, null, 'Санкт-Петербург', 'assistant',
   'Бывший руководитель проектов, хочет в ассистентскую роль.', 'https://disk.yandex.ru/i/demo-video-3', 'manager', 'in_work', null, null),
  ('ca000000-0000-4000-8000-000000000004', 'Светлана Образцова', '+7 900 100-00-04', null, null, 'Москва', 'assistant',
   'Опыт в туризме, английский C1.', null, 'site', 'in_work', now() - interval '25 days', 'demo-v1'),
  ('ca000000-0000-4000-8000-000000000005', 'Дарья Пробная', '+7 900 100-00-05', null, null, 'Москва', 'assistant',
   'Ассистент в производственной компании, 4 года.', null, 'manager', 'in_work', null, null),
  ('ca000000-0000-4000-8000-000000000006', 'Глеб Макетов', '+7 900 100-00-06', null, 'gleb@example.com', 'Москва', 'key_employee',
   'Операционный директор в рознице, команда 40 человек.', null, 'manager', 'in_work', null, null),
  ('ca000000-0000-4000-8000-000000000007', 'Кирилл Эскизов', '+7 900 100-00-07', null, null, 'Казань', 'key_employee',
   'Руководил филиалом, готов к переезду.', null, 'manager', 'reserve', null, null),
  ('ca000000-0000-4000-8000-000000000008', 'Наталья Шаблонова', '+7 900 100-00-08', null, null, 'Москва', 'nanny',
   'Няня 8 лет, педагогическое образование.', 'https://disk.yandex.ru/i/demo-video-8', 'site', 'in_work', now() - interval '20 days', 'demo-v1'),
  ('ca000000-0000-4000-8000-000000000009', 'Елена Черновая', '+7 900 100-00-09', '@elena_demo', null, 'Москва', 'nanny',
   'Няня для малышей, медицинская книжка.', null, 'site', 'in_work', now() - interval '18 days', 'demo-v1'),
  ('ca000000-0000-4000-8000-000000000010', 'Тимур Резервов', '+7 900 100-00-10', null, null, 'Москва', 'driver',
   'Семейный водитель, стаж 15 лет. Ни по одной заявке не предложен.', null, 'site', 'new', now() - interval '3 days', 'demo-v1');

-- Воронка. Менеджер предлагает и двигает, клиент принимает решения.
set app.actor_id = 'b0000000-0000-4000-8000-000000000001';

insert into public.request_candidates (id, request_id, candidate_id, recruiter_comment) values
  ('ac000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'Лучшее попадание по планированию.'),
  ('ac000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'Спокойная, системная.'),
  ('ac000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000003', 'Сильный управленческий опыт.'),
  ('ac000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000004', null),
  ('ac000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000005', null),
  ('ac000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000006', 'Закрывает задачу целиком.'),
  ('ac000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000007', null);

-- Решения клиента «Альфа».
set app.actor_id = 'c1000000-0000-4000-8000-000000000001';
update public.request_candidates set stage = 'interested', client_decision = 'interested',
  client_decided_at = now(), client_decided_by = 'c1000000-0000-4000-8000-000000000001'
where id in ('ac000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000003',
             'ac000000-0000-4000-8000-000000000005', 'ac000000-0000-4000-8000-000000000006');
update public.request_candidates set stage = 'interview', client_decision = 'interview',
  client_decided_at = now(), client_decided_by = 'c1000000-0000-4000-8000-000000000001'
where id in ('ac000000-0000-4000-8000-000000000003', 'ac000000-0000-4000-8000-000000000005',
             'ac000000-0000-4000-8000-000000000006');
update public.request_candidates set stage = 'rejected', client_decision = 'rejected',
  client_decided_at = now(), client_decided_by = 'c1000000-0000-4000-8000-000000000001',
  rejection_reason_id = (select id from public.rejection_reasons where label = 'Ожидания по зарплате')
where id in ('ac000000-0000-4000-8000-000000000004', 'ac000000-0000-4000-8000-000000000007');

-- Менеджер: оффер и выход.
set app.actor_id = 'b0000000-0000-4000-8000-000000000001';
update public.request_candidates set stage = 'offer'
where id in ('ac000000-0000-4000-8000-000000000005', 'ac000000-0000-4000-8000-000000000006');
update public.request_candidates set stage = 'hired' where id = 'ac000000-0000-4000-8000-000000000006';

-- Клиент «Бета».
set app.actor_id = 'b0000000-0000-4000-8000-000000000002';
insert into public.request_candidates (id, request_id, candidate_id, recruiter_comment) values
  ('bc000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000008', 'Тёплая и собранная.'),
  ('bc000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000009', null);
set app.actor_id = 'c2000000-0000-4000-8000-000000000001';
update public.request_candidates set stage = 'interested', client_decision = 'interested',
  client_decided_at = now(), client_decided_by = 'c2000000-0000-4000-8000-000000000001'
where id = 'bc000000-0000-4000-8000-000000000002';
reset app.actor_id;

-- Даты истории: каждый следующий переход на 3 дня позже, первое предложение — через 5 дней после заявки.
update public.stage_history h
   set changed_at = s.request_created + interval '5 days' + (s.rn - 1) * interval '3 days'
  from (
    select h2.id, r.created_at as request_created,
           row_number() over (partition by h2.request_candidate_id order by h2.id) as rn
    from public.stage_history h2
    join public.request_candidates rc on rc.id = h2.request_candidate_id
    join public.requests r on r.id = rc.request_id
  ) s
 where s.id = h.id;

update public.request_candidates rc
   set proposed_at = (select min(changed_at) from public.stage_history where request_candidate_id = rc.id);
update public.requests r
   set closed_at = (select max(h.changed_at) from public.stage_history h
                    join public.request_candidates rc on rc.id = h.request_candidate_id
                    where rc.request_id = r.id and h.to_stage = 'hired')
 where r.status = 'closed';

-- Интервью, документы, услуги, сообщения.
insert into public.interviews (request_candidate_id, scheduled_at, format, location, status) values
  ('ac000000-0000-4000-8000-000000000003', now() + interval '2 days', 'online', 'https://telemost.yandex.ru/demo', 'scheduled'),
  ('ac000000-0000-4000-8000-000000000005', now() - interval '3 days', 'office', 'Офис клиента', 'done');

insert into public.documents (company_id, request_id, doc_type, title, status, amount) values
  ('aa000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'contract', 'Договор на подбор (демо)', 'signed', null),
  ('aa000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'invoice', 'Счёт: предоплата 50% (демо)', 'paid', 75000),
  ('bb000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'contract', 'Договор на подбор (демо)', 'sent', null);

insert into public.service_requests (service_id, company_id, requested_by, status) values
  ('5e000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'new');

insert into public.messages (company_id, request_id, author_id, body) values
  ('aa000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Добавили двух кандидатов, посмотрите видео.'),
  ('bb000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'Первая подборка готова.');

insert into public.nps (company_id, request_id, score, comment, created_by) values
  ('aa000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 10, 'Демо-оценка', 'c1000000-0000-4000-8000-000000000001');
