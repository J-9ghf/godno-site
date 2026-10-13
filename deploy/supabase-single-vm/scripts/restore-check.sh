#!/usr/bin/env bash
# Проверка восстановления (вариант 1): последняя копия из S3 восстанавливается во ВРЕМЕННЫЙ контейнер Postgres
# (тот же образ, отдельный том, без портов наружу) и сверяется с числами, записанными при копировании.
# Рабочая база, её том и копии в S3 не затрагиваются. Временный контейнер удаляется в конце.
# Запуск: bash restore-check.sh /путь/к/закрытому-ключу-age   (ключ приносите на сервер только на время проверки)
set -euo pipefail
KEY="${1:?укажите путь к закрытому ключу age}"
CONF="${BACKUP_ENV:-/etc/ikr-supabase/backup.env}"
[ -f "$CONF" ] && set -a && . "$CONF" && set +a
: "${COMPOSE_DIR:=/opt/ikr-supabase}" "${BACKUP_BUCKET:?нет BACKUP_BUCKET}" "${BACKUP_PREFIX:=supabase-db}"
log() { echo "[$(date '+%F %T')] $*"; }
IMAGE=$(grep -m1 'image: supabase/postgres:' "$COMPOSE_DIR/docker-compose.yml" | awk '{print $2}')
CHECK=ikr-restore-check
TMP=$(mktemp -d); chmod 700 "$TMP"
cleanup() { docker rm -f "$CHECK" >/dev/null 2>&1 || true; docker volume rm -f "$CHECK-data" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
docker ps -a --format '{{.Names}}' | grep -qx "$CHECK" && { log "ОШИБКА: контейнер $CHECK уже существует — удалите его вручную"; exit 1; }

LAST=$(rclone lsf --include 'ikr-*.dump.age' "backup:$BACKUP_BUCKET/$BACKUP_PREFIX/" | sort | tail -1)
[ -n "$LAST" ] || { log "ОШИБКА: в S3 нет копий"; exit 1; }
log "последняя копия: $LAST"
for f in "$LAST" "$LAST.sha256" "${LAST%.age}.counts.json"; do rclone copyto "backup:$BACKUP_BUCKET/$BACKUP_PREFIX/$f" "$TMP/$f"; done
[ "$(sha256sum "$TMP/$LAST" | awk '{print $1}')" = "$(cat "$TMP/$LAST.sha256")" ] || { log "ОШИБКА: контрольная сумма не совпадает"; exit 1; }
age -d -i "$KEY" -o "$TMP/db.dump" "$TMP/$LAST"
log "контрольная сумма совпадает, копия расшифрована"

PW=$(openssl rand -hex 16)
docker run -d --name "$CHECK" --network none -v "$CHECK-data:/var/lib/postgresql/data" \
  -e POSTGRES_PASSWORD="$PW" -e PGPASSWORD="$PW" -e POSTGRES_DB=postgres "$IMAGE" \
  postgres -c config_file=/etc/postgresql/postgresql.conf >/dev/null
for i in $(seq 1 60); do docker exec "$CHECK" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
sleep 3
# Пустой экземпляр того же образа уже содержит схемы auth и storage: заменяем их содержимым копии
docker exec -i "$CHECK" pg_restore -U supabase_admin -d postgres --clean --if-exists --no-comments --exit-on-error < "$TMP/db.dump" \
  || { log "ОШИБКА: восстановление не удалось"; exit 1; }
GOT=$(docker exec "$CHECK" psql -U supabase_admin -d postgres -Atc "
  select json_object_agg(t, n) from (
    select 'auth.users' t, count(*) n from auth.users union all
    select 'storage.objects', count(*) from storage.objects union all
    select 'public.tables', count(*) from pg_tables where schemaname = 'public') x")
WANT=$(cat "$TMP/${LAST%.age}.counts.json")
norm() { echo "$1" | jq -S -c .; }
if [ "$(norm "$GOT")" = "$(norm "$WANT")" ]; then log "ВОССТАНОВЛЕНИЕ: ПРОВЕРКА ПРОЙДЕНА $(norm "$GOT")"; else log "ОШИБКА: ожидали $(norm "$WANT"), получили $(norm "$GOT")"; exit 2; fi
