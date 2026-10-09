-- Админ видит всё; аноним не видит ничего; отключённый пользователь теряет доступ сразу.
begin;
\ir helpers/auth.psql
select no_plan();

select tests.act_as('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from companies), 2, 'Админ видит все компании');
select is((select count(*)::int from requests), 4, 'Админ видит все заявки, включая входящие');
select is((select count(*)::int from candidates), 10, 'Админ видит весь пул');
select is((select count(*)::int from v_company_metrics), 2, 'Админ видит показатели всех компаний');
select ok((select count(*) from audit_log) > 0, 'Админ читает журнал действий');
select is((select count(*)::int from nps), 1, 'Админ читает NPS');
select throws_ok($$ insert into audit_log (action) values ('fake') $$, '42501', null,
  'Даже админ не пишет в журнал напрямую');
select throws_ok($$ delete from audit_log $$, '42501', null, 'Журнал нельзя удалить');
select throws_ok($$ update stage_history set to_stage = 'hired' $$, '42501', null, 'Историю этапов нельзя переписать');
select lives_ok($$ update settings set value = '90' where key = 'guarantee_days' $$, 'Админ меняет настройки');
select throws_ok($$ select client_decide('ac000000-0000-4000-8000-000000000001', 'interested') $$,
  '42501', null, 'Админ не принимает решения за клиента');

-- Аноним (посетитель сайта) к таблицам не имеет доступа совсем.
select tests.as_owner();
select tests.act_as_anon();
select throws_ok($$ select * from requests $$, '42501', null, 'Аноним не читает заявки');
select throws_ok($$ select * from candidates $$, '42501', null, 'Аноним не читает кандидатов');
select throws_ok($$ select * from client_candidates $$, '42501', null, 'Аноним не читает client_candidates');
select throws_ok($$ select * from v_company_metrics $$, '42501', null, 'Аноним не читает показатели');
select throws_ok($$ insert into candidates (full_name, phone, source, consent_at) values ('x', '1', 'site', now()) $$,
  '42501', null, 'Аноним не пишет в пул напрямую (формы пишет сервер)');

-- Вошедший без профиля (например, удалённый) не видит ничего.
select tests.as_owner();
select tests.act_as('99999999-0000-4000-8000-000000000000');
select is((select count(*)::int from companies), 0, 'Пользователь без профиля не видит компаний');
select is((select count(*)::int from requests), 0, 'Пользователь без профиля не видит заявок');

-- Отключение одним действием.
select tests.as_owner();
update profiles set is_active = false where id = 'c1000000-0000-4000-8000-000000000001';
select tests.act_as('c1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from requests), 0, 'Отключённый клиент не видит заявки');
select is((select count(*)::int from client_candidates), 0, 'Отключённый клиент не видит кандидатов');
select throws_ok($$ select client_decide('ac000000-0000-4000-8000-000000000001', 'interested') $$,
  '42501', null, 'Отключённый клиент не принимает решения');

select tests.as_owner();
update profiles set is_active = false where id = 'b0000000-0000-4000-8000-000000000001';
select tests.act_as('b0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from candidates), 0, 'Отключённый менеджер не видит пул');
select is((select count(*)::int from companies), 0, 'Отключённый менеджер не видит клиентов');

select * from finish();
rollback;
