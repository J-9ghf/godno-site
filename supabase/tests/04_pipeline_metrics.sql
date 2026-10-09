-- Решения клиента, история этапов, статусы заявок и расчёт показателей.
begin;
\ir helpers/auth.psql
select no_plan();

-- ───── Показатели по демо-данным ─────
select tests.act_as('c1000000-0000-4000-8000-000000000001');

select results_eq(
  $$ select requests_in_work, requests_closed, offered, interested, interview, offer, hired from v_company_metrics $$,
  $$ values (1, 1, 7, 4, 3, 2, 1) $$,
  'Альфа: в работе 1, закрыто 1, воронка 7 → 4 → 3 → 2 → 1');
select results_eq(
  $$ select pct_interest, pct_interview, pct_interview_to_offer, pct_offer_to_hire from v_company_metrics $$,
  $$ values (57.1, 42.9, 66.7, 50.0) $$,
  'Альфа: конверсии интерес 57,1%, интервью 42,9%, интервью→оффер 66,7%, оффер→выход 50%');
select results_eq(
  $$ select avg_days_to_first_candidate, avg_days_to_close from v_company_metrics $$,
  $$ values (5.0, 17.0) $$,
  'Альфа: время до первого кандидата 5 дней, срок закрытия 17 дней');
select results_eq(
  $$ select reason, count from v_rejection_reasons $$,
  $$ values ('Ожидания по зарплате', 2) $$,
  'Альфа: причины отказов сгруппированы');
select results_eq(
  $$ select status::text, in_guarantee from v_request_metrics where request_id = 'a1000000-0000-4000-8000-000000000002' $$,
  $$ values ('closed', true) $$,
  'Заявка с вышедшим сотрудником закрыта автоматически и находится в гарантии');
select is(
  (select count(*)::int from stage_history where request_candidate_id = 'ac000000-0000-4000-8000-000000000006'),
  5, 'История этапов: 5 переходов от предложения до выхода');

-- ───── Решения клиента ─────
select lives_ok($$ select client_decide('ac000000-0000-4000-8000-000000000001', 'interested') $$,
  'Клиент отмечает «Интересен»');
select results_eq(
  $$ select stage::text, client_decision::text from request_candidates where id = 'ac000000-0000-4000-8000-000000000001' $$,
  $$ values ('interested', 'interested') $$, 'Этап и решение обновились');
select results_eq(
  $$ select from_stage::text, to_stage::text, changed_by from stage_history
     where request_candidate_id = 'ac000000-0000-4000-8000-000000000001' order by id desc limit 1 $$,
  $$ values ('offered', 'interested', 'c1000000-0000-4000-8000-000000000001'::uuid) $$,
  'Триггер записал в историю: откуда, куда и кто');
select is((select interested from v_company_metrics), 5, 'Показатель «интерес» пересчитался сам');

select throws_ok($$ select client_decide('ac000000-0000-4000-8000-000000000001', 'rejected') $$,
  '23514', 'Укажите причину отказа', 'Отказ без причины не принимается');
select throws_ok($$ select client_decide('ac000000-0000-4000-8000-000000000006', 'rejected', 1) $$,
  'P0001', null, 'По вышедшему сотруднику решение уже не меняется');
select throws_ok($$ select client_decide('ac000000-0000-4000-8000-000000000005', 'interested') $$,
  'P0001', null, 'Нельзя вернуть кандидата с оффера на «Интересен»');
select lives_ok(
  $$ select client_decide('ac000000-0000-4000-8000-000000000001', 'rejected',
       (select id from rejection_reasons where label = 'Недостаточно опыта'), 'Мало опыта в B2B') $$,
  'Отказ с причиной принимается');
select results_eq(
  $$ select stage::text, rejection_comment from request_candidates where id = 'ac000000-0000-4000-8000-000000000001' $$,
  $$ values ('rejected', 'Мало опыта в B2B') $$, 'Отказ записан с комментарием');
select is((select interested from v_company_metrics), 5,
  'Кандидат, дошедший до «Интересен» и получивший отказ, остаётся в показателе интереса');

select tests.as_owner();
select is(
  (select count(*)::int from audit_log where action = 'client.decision'
     and actor_id = 'c1000000-0000-4000-8000-000000000001'),
  2, 'Оба решения клиента записаны в журнал');

-- ───── Статусы заявки следуют за воронкой ─────
select is((select status::text from requests where id = 'b1000000-0000-4000-8000-000000000001'), 'offered',
  'После предложения кандидатов заявка Беты в статусе «Кандидаты предложены»');
select tests.act_as('c2000000-0000-4000-8000-000000000001');
select lives_ok($$ select client_decide('bc000000-0000-4000-8000-000000000002', 'interview') $$,
  'Клиент Б назначает интервью');
select is((select status::text from requests where id = 'b1000000-0000-4000-8000-000000000001'), 'interview',
  'Заявка перешла в статус «Интервью»');

select * from finish();
rollback;
