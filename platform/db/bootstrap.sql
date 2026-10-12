-- Выполняется один раз суперпользователем (локально — scripts/dev-db.sh,
-- в облаке — администратором базы через консоль провайдера).
-- Пароли передаются переменными psql и не хранятся в репозитории:
--   psql -v owner_password=... -v app_password=... -f db/bootstrap.sql
--
-- ikr_owner — владелец схемы, только для миграций.
-- ikr_app   — роль приложения: без BYPASSRLS, не владелец таблиц, поэтому на неё действуют политики RLS.
CREATE ROLE ikr_owner LOGIN PASSWORD :'owner_password';
CREATE ROLE ikr_app LOGIN PASSWORD :'app_password' NOBYPASSRLS;
CREATE DATABASE ikr OWNER ikr_owner ENCODING 'UTF8' TEMPLATE template0;
\connect ikr
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO ikr_owner;
GRANT USAGE ON SCHEMA public TO ikr_app;
