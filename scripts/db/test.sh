#!/usr/bin/env bash
# Поднимает чистую тестовую базу на обычном PostgreSQL, применяет миграции и демо-данные,
# запускает pgTAP-тесты из supabase/tests.
#
# Нужно: PostgreSQL 15+ с расширением pgtap и pg_prove.
#   DB_ADMIN_URL — подключение суперпользователя (по умолчанию локальный postgres).
#   DB_TEST_NAME — имя тестовой базы (будет пересоздана).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ADMIN_URL="${DB_ADMIN_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
DB="${DB_TEST_NAME:-ikr_test}"
TEST_URL="${ADMIN_URL%/*}/$DB"

psql_q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "→ пересоздаю базу $DB"
psql_q "$ADMIN_URL" -c "drop database if exists $DB with (force)" -c "create database $DB"

echo "→ эмуляция Supabase (роли, auth, storage)"
psql_q "$TEST_URL" -f "$ROOT/scripts/db/supabase-shim.sql"
psql_q "$TEST_URL" -c "create extension if not exists pgtap"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ миграция $(basename "$f")"
  psql_q "$TEST_URL" -f "$f"
done

echo "→ демо-данные"
psql_q "$TEST_URL" -f "$ROOT/supabase/seed.sql"

echo "→ тесты"
cd "$ROOT/supabase/tests"
pg_prove --dbname "$TEST_URL" ${PG_PROVE_FLAGS:-} ./*.sql
