-- Форма резюме: объединение дублей и закрытость функции от пользователей.
begin;
\ir helpers/auth.psql
select no_plan();

select tests.act_as_anon();
select throws_ok($$ select * from submit_site_resume('X', '+79001112233', null, null, null, null, null, null, 'v') $$,
  '42501', null, 'Аноним не вызывает функцию напрямую');
select tests.as_owner();
select tests.act_as('c1000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from submit_site_resume('X', '+79001112233', null, null, null, null, null, null, 'v') $$,
  '42501', null, 'Клиент не вызывает функцию');

select tests.as_owner();
select tests.act_as_service();

select results_eq(
  $$ select merged from submit_site_resume('Новая Кандидатка', '+7 (901) 555-00-11', null, null, 'Тверь', 'nanny', 'site/a.pdf', null, 'test') $$,
  $$ values (false) $$, 'Новый кандидат создаётся');
select results_eq(
  $$ select source::text, pool_status::text, consent_version from candidates where phone_norm = '79015550011' $$,
  $$ values ('site', 'new', 'test') $$, 'Источник «сайт», статус «Новый», версия согласия сохранена');

select results_eq(
  $$ select merged from submit_site_resume('Новая Кандидатка', '8 901 555 00 11', '@New_Cand', null, 'Москва', 'governess', 'site/b.pdf', 'https://disk.yandex.ru/i/x', 'test') $$,
  $$ values (true) $$, 'Тот же телефон в другом формате — дубль объединяется');
select is((select count(*)::int from candidates where phone_norm = '79015550011'), 1, 'Запись одна');
select results_eq(
  $$ select city, position_code, resume_path, telegram, 'повторное резюме' = any (tags) from candidates where phone_norm = '79015550011' $$,
  $$ values ('Москва', 'governess', 'site/b.pdf', '@New_Cand', true) $$, 'Данные обновлены, Telegram дополнен, есть метка');

select results_eq(
  $$ select merged from submit_site_resume('Та же', null, 'https://t.me/new_cand', null, null, null, 'site/c.pdf', null, 'test') $$,
  $$ values (true) $$, 'Тот же Telegram по ссылке и в другом регистре — дубль');
select results_eq(
  $$ select merged from submit_site_resume('Пётр Тестов', '+7 900 100-00-03', null, null, null, null, 'site/d.pdf', null, 'test') $$,
  $$ values (true) $$, 'Совпадение с кандидатом, добавленным менеджером, тоже объединяется');
select is((select full_name from candidates where phone_norm = '79001000003'), 'Пётр Тестов', 'Имя существующего кандидата не перезаписывается');
select results_eq(
  $$ select merged from submit_site_resume('Ирина', null, null, 'IRINA@example.com', null, null, 'site/e.pdf', null, 'test') $$,
  $$ values (true) $$, 'Дубль по почте без учёта регистра');
select throws_ok($$ select * from submit_site_resume('Без контактов', null, '  ', null, null, null, null, null, 'v') $$,
  '23514', null, 'Без контакта не принимается');

select * from finish();
rollback;
