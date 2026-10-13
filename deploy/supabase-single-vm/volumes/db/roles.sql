-- Пароли служебных ролей Supabase (роли создаёт сам образ supabase/postgres). Выполняется один раз при создании базы.
-- Все сервисы ходят в базу со своим паролем из .env (POSTGRES_PASSWORD); наружу база не открыта.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
