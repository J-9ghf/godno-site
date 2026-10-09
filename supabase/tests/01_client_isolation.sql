-- Изоляция клиентов: клиент А не видит данные клиента Б и не видит пул кандидатов.
begin;
\ir helpers/auth.psql
select no_plan();

-- ───── Клиент А (руководитель) ─────
select tests.act_as('c1000000-0000-4000-8000-000000000001');

select results_eq($$ select id from companies $$,
  $$ values ('aa000000-0000-4000-8000-000000000001'::uuid) $$,
  'Клиент А видит только свою компанию');

select results_eq($$ select id from requests order by id $$,
  $$ values ('a1000000-0000-4000-8000-000000000001'::uuid), ('a1000000-0000-4000-8000-000000000002'::uuid) $$,
  'Клиент А видит только заявки своей компании (без заявок Б и входящих с сайта)');

select is((select count(*)::int from candidates), 0, 'Клиент А не читает пул кандидатов');
select is((select count(*)::int from candidates where id = 'ca000000-0000-4000-8000-000000000001'), 0,
  'Клиент А не читает даже своих предложенных кандидатов из таблицы candidates напрямую');

select is((select count(*)::int from request_candidates), 7, 'Клиент А видит 7 кандидатов по своим заявкам');
select is((select count(*)::int from client_candidates), 7, 'client_candidates: 7 строк у клиента А');
select is((select count(*)::int from client_candidates where company_id <> 'aa000000-0000-4000-8000-000000000001'), 0,
  'client_candidates: ни одной строки чужой компании');
select is((select count(*)::int from client_candidates
           where candidate_id in ('ca000000-0000-4000-8000-000000000008', 'ca000000-0000-4000-8000-000000000009',
                                  'ca000000-0000-4000-8000-000000000010')), 0,
  'Кандидаты Б и непредложенный кандидат из пула клиенту А не видны');

select hasnt_column('public', 'client_candidates', 'phone', 'В client_candidates нет телефона');
select hasnt_column('public', 'client_candidates', 'email', 'В client_candidates нет почты');
select hasnt_column('public', 'client_candidates', 'telegram', 'В client_candidates нет Telegram');
select hasnt_column('public', 'client_candidates', 'resume_path', 'В client_candidates нет пути к файлу резюме');
select hasnt_column('public', 'client_candidates', 'internal_notes', 'В client_candidates нет внутренних заметок');

select is((select count(*)::int from stage_history h
           join request_candidates rc on rc.id = h.request_candidate_id
           where rc.request_id = 'b1000000-0000-4000-8000-000000000001'), 0,
  'Клиент А не видит историю этапов по заявке Б');
select is((select count(*)::int from stage_history
           where request_candidate_id = 'bc000000-0000-4000-8000-000000000001'), 0,
  'Клиент А не видит историю этапов кандидата Б по id');

select results_eq($$ select company_id from v_company_metrics $$,
  $$ values ('aa000000-0000-4000-8000-000000000001'::uuid) $$,
  'Показатели: клиент А получает только строку своей компании');
select is((select count(*)::int from v_request_metrics where company_id is distinct from 'aa000000-0000-4000-8000-000000000001'), 0,
  'Показатели по заявкам: нет чужих и входящих заявок');
select is((select count(*)::int from v_rejection_reasons where company_id <> 'aa000000-0000-4000-8000-000000000001'), 0,
  'Причины отказов: только своя компания');

select is((select count(*)::int from documents where company_id <> 'aa000000-0000-4000-8000-000000000001'), 0,
  'Клиент А не видит документы Б');
select is((select count(*)::int from documents), 2, 'Клиент А видит свои 2 документа');
select is((select count(*)::int from messages where company_id <> 'aa000000-0000-4000-8000-000000000001'), 0,
  'Клиент А не видит сообщения Б');
select is((select count(*)::int from interviews), 2, 'Клиент А видит только интервью по своим кандидатам');
select is((select count(*)::int from service_requests where company_id <> 'aa000000-0000-4000-8000-000000000001'), 0,
  'Клиент А не видит запросы услуг Б');
select is((select count(*)::int from audit_log), 0, 'Клиент не читает журнал действий');
select is((select count(*)::int from nps), 0, 'Клиент не читает NPS');
select is((select count(*)::int from manager_companies), 0, 'Клиент не видит назначения менеджеров');
select is((select count(*)::int from profiles where company_id = 'bb000000-0000-4000-8000-000000000001'), 0,
  'Клиент А не видит пользователей Б');
select is((select count(*)::int from profiles where id = 'b0000000-0000-4000-8000-000000000002'), 0,
  'Клиент А не видит чужого менеджера');
select is((select count(*)::int from profiles where id = 'b0000000-0000-4000-8000-000000000001'), 1,
  'Клиент А видит своего менеджера');

-- Запись в чужое.
select throws_ok(
  $$ insert into requests (company_id, title, source, status, created_by)
     values ('bb000000-0000-4000-8000-000000000001', 'Чужая', 'client', 'new', 'c1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'Клиент А не может создать заявку в компании Б');
select lives_ok(
  $$ insert into requests (company_id, title, source, status, created_by)
     values ('aa000000-0000-4000-8000-000000000001', 'Своя', 'client', 'new', 'c1000000-0000-4000-8000-000000000001') $$,
  'Клиент А может создать заявку в своей компании');
select throws_ok(
  $$ insert into requests (company_id, title, source, status, created_by)
     values ('aa000000-0000-4000-8000-000000000001', 'Своя', 'client', 'closed', 'c1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'Клиент не может создать заявку сразу в статусе «Закрыта»');

select is_empty(
  $$ update request_candidates set stage = 'hired' where id = 'ac000000-0000-4000-8000-000000000001' returning id $$,
  'Клиент не меняет этап напрямую (только через client_decide)');
select is_empty(
  $$ update requests set status = 'closed' where id = 'a1000000-0000-4000-8000-000000000001' returning id $$,
  'Клиент не меняет статус заявки');
select throws_ok(
  $$ select client_decide('bc000000-0000-4000-8000-000000000001', 'interested') $$,
  'P0002', 'Кандидат не найден', 'Клиент А не может принять решение по кандидату Б');
select throws_ok(
  $$ insert into candidates (full_name, phone, source) values ('Хакер', '+70000000000', 'manager') $$,
  '42501', null, 'Клиент не добавляет кандидатов в пул');
select throws_ok(
  $$ insert into messages (company_id, author_id, body)
     values ('bb000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'привет') $$,
  '42501', null, 'Клиент А не пишет в переписку Б');
select throws_ok(
  $$ insert into service_requests (service_id, company_id, requested_by)
     values ('5e000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'Клиент А не создаёт запрос услуги от имени Б');

-- Повышение прав.
select throws_ok(
  $$ update profiles set role = 'admin' where id = 'c1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'Клиент не может сделать себя админом');
select throws_ok(
  $$ update profiles set company_id = 'bb000000-0000-4000-8000-000000000001' where id = 'c1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'Клиент не может перейти в чужую компанию');
select lives_ok(
  $$ update profiles set full_name = 'Анна А.' where id = 'c1000000-0000-4000-8000-000000000001' $$,
  'Клиент может поменять своё имя');

-- Приглашения руководителя.
select lives_ok(
  $$ insert into invitations (email, role, company_id, token_hash, invited_by)
     values ('new.colleague@example.com', 'client', 'aa000000-0000-4000-8000-000000000001', 'hash-1',
             'c1000000-0000-4000-8000-000000000001') $$,
  'Руководитель А приглашает коллегу в свою компанию');
select throws_ok(
  $$ insert into invitations (email, role, company_id, token_hash, invited_by)
     values ('spy@example.com', 'client', 'bb000000-0000-4000-8000-000000000001', 'hash-2',
             'c1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'Руководитель А не приглашает в компанию Б');
select throws_ok(
  $$ insert into invitations (email, role, token_hash, invited_by)
     values ('boss@example.com', 'manager', 'hash-3', 'c1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'Руководитель клиента не приглашает менеджеров');
select throws_ok(
  $$ insert into invitations (email, role, company_id, is_company_lead, token_hash, invited_by)
     values ('lead2@example.com', 'client', 'aa000000-0000-4000-8000-000000000001', true, 'hash-4',
             'c1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'Руководитель клиента не создаёт второго руководителя');

select throws_ok(
  $$ insert into invitations (email, role, company_id, token_hash, invited_by, expires_at)
     values ('long@example.com', 'client', 'aa000000-0000-4000-8000-000000000001', 'hash-6',
             'c1000000-0000-4000-8000-000000000001', now() + interval '1 year') $$,
  '23514', null, 'Приглашение не может жить дольше 72 часов');

-- ───── Рядовой сотрудник клиента А ─────
select tests.as_owner();
select tests.act_as('c1000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ insert into invitations (email, role, company_id, token_hash, invited_by)
     values ('x@example.com', 'client', 'aa000000-0000-4000-8000-000000000001', 'hash-5',
             'c1000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'Рядовой сотрудник клиента не приглашает коллег');
select is((select count(*)::int from profiles where role = 'client'), 1,
  'Рядовой сотрудник видит только свой профиль среди клиентов');
select is((select count(*)::int from client_candidates), 7, 'Рядовой сотрудник видит кандидатов своей компании');

-- ───── Клиент Б ─────
select tests.as_owner();
select tests.act_as('c2000000-0000-4000-8000-000000000001');
select results_eq($$ select id from requests $$,
  $$ values ('b1000000-0000-4000-8000-000000000001'::uuid) $$, 'Клиент Б видит только свою заявку');
select is((select count(*)::int from client_candidates), 2, 'Клиент Б видит только своих 2 кандидатов');
select is((select count(*)::int from candidates), 0, 'Клиент Б не читает пул кандидатов');
select is((select count(*)::int from request_candidates where request_id in
           ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002')), 0,
  'Клиент Б не видит кандидатов А');
select is((select count(*)::int from documents), 1, 'Клиент Б видит только свой документ');
select is((select count(*)::int from invitations), 0, 'Клиент Б не видит приглашения А');

select * from finish();
rollback;
