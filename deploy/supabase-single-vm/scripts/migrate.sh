#!/usr/bin/env bash
# Применяет миграции базы ИКР (supabase/migrations/*.sql) к базе в контейнере db.
#  - каждая миграция — в одной транзакции: ошибка откатывает её целиком, следующие не запускаются;
#  - применённые записываются в supabase_migrations.schema_migrations (та же таблица, что у Supabase CLI),
#    повторный запуск применяет только новые;
#  - перед новыми миграциями — копия базы в S3, если настроены копии (/etc/ikr-supabase/backup.env);
#  - демо-данные (supabase/seed.sql) НЕ загружаются. Только для демо-стенда: --demo.
# Запуск: bash scripts/migrate.sh /opt/ikr/app/supabase [--demo] [--no-backup]
set -euo pipefail
SRC="${1:?укажите папку supabase приложения, например /opt/ikr/app/supabase}"
shift || true
DEMO=0; BACKUP=1
for a in "$@"; do
  case "$a" in
    --demo) DEMO=1 ;;
    --no-backup) BACKUP=0 ;;
    *) echo "неизвестный параметр: $a"; exit 2 ;;
  esac
done
DIR="${COMPOSE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
# Запуск из папки сборки: docker compose сам подхватит docker-compose.override.yml, если он есть
dc() { (cd "$DIR" && docker compose "$@"); }
# Как в облачном Supabase: миграции выполняет роль postgres
psql_db() { dc exec -T db psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

[ -d "$SRC/migrations" ] || { echo "нет папки $SRC/migrations"; exit 1; }

psql_db -c "set client_min_messages = warning; create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);" >/dev/null

applied=$(psql_db -Atc "select version from supabase_migrations.schema_migrations")
pending=()
for f in "$SRC"/migrations/*.sql; do
  base=$(basename "$f" .sql)
  version="${base%%_*}"
  grep -qx "$version" <<<"$applied" || pending+=("$f")
done

if [ ${#pending[@]} -eq 0 ]; then
  echo "Новых миграций нет."
else
  if [ "$BACKUP" = 1 ] && [ -f "${BACKUP_ENV:-/etc/ikr-supabase/backup.env}" ]; then
    echo "Копия базы перед миграциями…"
    bash "$DIR/scripts/backup-db.sh"
  fi
  for f in "${pending[@]}"; do
    base=$(basename "$f" .sql)
    version="${base%%_*}"; name="${base#*_}"
    echo "→ $base"
    { echo "begin;"; cat "$f"; echo ";"
      echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name');"
      echo "commit;"; } | psql_db -f -
  done
  echo "Применено миграций: ${#pending[@]}."
fi

if [ "$DEMO" = 1 ]; then
  echo "→ демо-данные (seed.sql): только для демо-стенда, пароли демо-пользователей известны из репозитория"
  psql_db -f - < "$SRC/seed.sql"
fi
