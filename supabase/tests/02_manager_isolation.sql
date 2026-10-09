-- Менеджер видит только назначенных клиентов и не принимает решения за клиента.
begin;
\ir helpers/auth.psql
select no_plan();

select tests.act_as('b0000000-0000-4000-8000-000000000001');  -- менеджер 1 → Альфа

select results_eq($$ select id from companies $$,
  $$ values ('aa000000-0000-4000-8000-000000000001'::uuid) $$, 'Менеджер 1 видит только компанию Альфа');
select results_eq($$ select id from requests order by id $$,
  $$ values ('a1000000-0000-4000-8000-000000000001'::uuid), ('a1000000-0000-4000-8000-000000000002'::uuid),
            ('f0000000-0000-4000-8000-000000000001'::uuid) $$,
  'Менеджер 1 видит заявки Альфы и входящую с сайта, но не заявку Беты');
select is((select count(*)::int from request_candidates where request_id = 'b1000000-0000-4000-8000-000000000001'), 0,
  'Менеджер 1 не видит кандидатов по заявке Беты');
select is((select count(*)::int from documents where company_id = 'bb000000-0000-4000-8000-000000000001'), 0,
  'Менеджер 1 не видит документы Беты');
select is((select count(*)::int from messages where company_id = 'bb000000-0000-4000-8000-000000000001'), 0,
  'Менеджер 1 не видит переписку Беты');
select results_eq($$ select company_id from v_company_metrics $$,
  $$ values ('aa000000-0000-4000-8000-000000000001'::uuid) $$, 'Показатели менеджера 1: только Альфа');
select is((select count(*)::int from profiles where company_id = 'bb000000-0000-4000-8000-000000000001'), 0,
  'Менеджер 1 не видит пользователей Беты');
select is((select count(*)::int from candidates), 10, 'Менеджер видит пул кандидатов');
select is((select count(*)::int from client_candidates), 0, 'client_candidates предназначено только клиентам');
select is((select count(*)::int from audit_log), 0, 'Менеджер не читает журнал');
select is((select count(*)::int from invitations), 0, 'Менеджер не видит приглашения');

-- Запись в чужое.
select throws_ok(
  $$ insert into request_candidates (request_id, candidate_id)
     values ('b1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000010') $$,
  '42501', null, 'Менеджер 1 не предлагает кандидата по заявке Беты');
select is_empty(
  $$ update requests set status = 'paused' where id = 'b1000000-0000-4000-8000-000000000001' returning id $$,
  'Менеджер 1 не меняет заявку Беты');
select is_empty(
  $$ update request_candidates set stage = 'offer' where id = 'bc000000-0000-4000-8000-000000000001' returning id $$,
  'Менеджер 1 не меняет этап кандидата Беты');
select throws_ok(
  $$ insert into documents (company_id, doc_type, title) values ('bb000000-0000-4000-8000-000000000001', 'invoice', 'x') $$,
  '42501', null, 'Менеджер 1 не загружает документы Бете');
select throws_ok(
  $$ update requests set company_id = 'bb000000-0000-4000-8000-000000000001'
     where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'Менеджер 1 не привязывает входящую заявку к чужому клиенту');
select lives_ok(
  $$ update requests set company_id = 'aa000000-0000-4000-8000-000000000001', status = 'search',
                         assigned_manager_id = 'b0000000-0000-4000-8000-000000000001'
     where id = 'f0000000-0000-4000-8000-000000000001' $$,
  'Менеджер 1 принимает входящую заявку и привязывает к своему клиенту');

-- Решения за клиента.
select throws_ok(
  $$ update request_candidates set stage = 'interested' where id = 'ac000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'Менеджер не ставит «Интересен» за клиента');
select throws_ok(
  $$ update request_candidates set client_decision = 'interview' where id = 'ac000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'Менеджер не записывает решение клиента');
select throws_ok(
  $$ select client_decide('ac000000-0000-4000-8000-000000000001', 'interested') $$,
  '42501', null, 'Менеджер не вызывает client_decide');
select throws_ok(
  $$ insert into request_candidates (request_id, candidate_id, stage)
     values ('a1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000010', 'interested') $$,
  '42501', null, 'Менеджер не добавляет кандидата сразу в «Интересен»');

-- Разрешённая работа менеджера.
select lives_ok(
  $$ insert into request_candidates (request_id, candidate_id)
     values ('a1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000010') $$,
  'Менеджер 1 предлагает кандидата из пула по заявке Альфы');
select lives_ok(
  $$ update request_candidates set stage = 'interview' where id = 'ac000000-0000-4000-8000-000000000001' $$,
  'Менеджер 1 переводит кандидата Альфы на интервью');
select is(
  (select changed_by from stage_history where request_candidate_id = 'ac000000-0000-4000-8000-000000000001'
   order by id desc limit 1),
  'b0000000-0000-4000-8000-000000000001'::uuid, 'История этапов записала менеджера как автора');
select throws_ok(
  $$ update request_candidates set stage = 'rejected' where id = 'ac000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'Отказ без причины невозможен и для менеджера');

-- Управление пользователями и настройками — только админ.
select is_empty($$ update settings set value = '1' where key = 'guarantee_days' returning key $$,
  'Менеджер не меняет настройки');
select throws_ok(
  $$ insert into manager_companies (manager_id, company_id)
     values ('b0000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'Менеджер не назначает себе чужого клиента');
select throws_ok(
  $$ update profiles set role = 'admin' where id = 'b0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'Менеджер не повышает себе роль');
select throws_ok(
  $$ insert into services (title) values ('x') $$, '42501', null, 'Менеджер не редактирует каталог услуг');

-- ───── Менеджер 2 ─────
select tests.as_owner();
select tests.act_as('b0000000-0000-4000-8000-000000000002');
select results_eq($$ select id from companies $$,
  $$ values ('bb000000-0000-4000-8000-000000000001'::uuid) $$, 'Менеджер 2 видит только Бету');
select is((select count(*)::int from request_candidates where request_id in
           ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002')), 0,
  'Менеджер 2 не видит кандидатов Альфы');

select * from finish();
rollback;
