-- Блокировка входа: 5 неверных попыток → 15 минут. Функция доступна только серверу.
begin;
\ir helpers/auth.psql
select no_plan();

select tests.act_as('c1000000-0000-4000-8000-000000000001');
select throws_ok($$ select login_locked_until('alfa.lead@example.com', null) $$, '42501', null,
  'Пользователь не вызывает функцию блокировки');
select throws_ok($$ select * from login_attempts $$, '42501', null, 'Пользователь не читает попытки входа');

select tests.as_owner();
select tests.act_as_service();

insert into login_attempts (email, ip, success)
select 'victim@example.com', '10.0.0.1', false from generate_series(1, 4);
select is(login_locked_until('victim@example.com', '10.0.0.1'), null, '4 ошибки — ещё не блокировка');

insert into login_attempts (email, ip, success) values ('Victim@Example.com', '10.0.0.2', false);
select ok(login_locked_until('victim@example.com', '10.0.0.3') between now() + interval '14 minutes' and now() + interval '16 minutes',
  '5-я ошибка — блокировка на 15 минут, регистр почты не важен');

update login_attempts set created_at = created_at - interval '16 minutes' where email ilike 'victim@example.com';
select is(login_locked_until('victim@example.com', null), null, 'Через 15 минут блокировка снимается');

insert into login_attempts (email, ip, success)
select 'other@example.com', '10.0.0.9', false from generate_series(1, 3);
insert into login_attempts (email, ip, success) values ('other@example.com', '10.0.0.9', true);
insert into login_attempts (email, ip, success)
select 'other@example.com', '10.0.0.9', false from generate_series(1, 2);
select is(login_locked_until('other@example.com', null), null, 'Успешный вход обнуляет счётчик');

insert into login_attempts (email, ip, success)
select 'user' || g || '@example.com', '10.0.0.66', false from generate_series(1, 20) g;
select ok(login_locked_until('fresh@example.com', '10.0.0.66') is not null,
  'Перебор разных почт с одного IP блокирует IP');

select * from finish();
rollback;
