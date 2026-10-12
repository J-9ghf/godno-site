#!/usr/bin/env bash
# Проверка восстановления: копия разворачивается в отдельную временную базу, затем сверяются
# список миграций и количество строк в основных таблицах с исходной базой. Рабочая база не меняется.
# Использование: ADMIN_URL=postgres://postgres@host/postgres SOURCE_URL=... ./scripts/restore-check.sh путь/к/копии.dump
set -euo pipefail
DUMP="${1:?Укажите файл копии}"
: "${ADMIN_URL:?Нужна ADMIN_URL (пользователь с правом CREATE DATABASE)}"
: "${SOURCE_URL:?Нужна SOURCE_URL (исходная база для сверки)}"
[ -f "$DUMP.sha256" ] && sha256sum -c "$DUMP.sha256" >/dev/null && echo "контрольная сумма совпадает"
DB="ikr_restore_check_$(date +%s)"
psql "$ADMIN_URL" -qc "create database $DB"
trap 'psql "$ADMIN_URL" -qc "drop database if exists $DB" >/dev/null' EXIT
TARGET="${ADMIN_URL%/*}/$DB"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$DUMP"
Q="select string_agg(t || '=' || n, ' ' order by t) from (
  select 'migrations' t, count(*) n from schema_migrations union all
  select 'companies', count(*) from companies union all select 'users', count(*) from \"user\" union all
  select 'vacancies', count(*) from vacancies union all select 'candidates', count(*) from candidates union all
  select 'applications', count(*) from applications union all select 'presentations', count(*) from presentations union all
  select 'stage_history', count(*) from stage_history union all select 'consents', count(*) from consents union all
  select 'files', count(*) from files union all select 'audit_log', count(*) from audit_log) x"
SRC=$(psql "$SOURCE_URL" -Atc "$Q"); DST=$(psql "$TARGET" -Atc "$Q")
echo "исходная:      $SRC"; echo "восстановлена: $DST"
if [ "$SRC" = "$DST" ]; then echo "ПРОВЕРКА ПРОЙДЕНА"; else echo "РАСХОЖДЕНИЕ: копия не совпадает с базой (если база менялась после копии, это ожидаемо)"; exit 1; fi
