#!/usr/bin/env bash
# Ежедневная копия базы Supabase в S3 (вариант 1). Запускается таймером systemd (systemd/ikr-supabase-backup.timer).
#  1. pg_dump всей базы postgres (данные приложения, пользователи auth, записи о файлах storage) из контейнера db;
#  2. проверка, что копия читается (pg_restore --list), и подсчёт строк в главных таблицах;
#  3. шифрование открытым ключом age (закрытый ключ хранится НЕ на сервере), контрольная сумма SHA-256;
#  4. выгрузка в бакет копий по S3 (любой S3-совместимый: rclone, настройки в backup.env), сверка размера;
#  5. удаление копий старше BACKUP_KEEP_DAYS (14) — только в папке копий базы, только после успешной выгрузки.
# Файлы кандидатов уже лежат в S3; при FILES_BACKUP=1 они дополнительно копируются в бакет копий (без удаления).
# Настройки: /etc/ikr-supabase/backup.env (см. backup.env.example). Пароли на экран не выводятся.
set -euo pipefail
CONF="${BACKUP_ENV:-/etc/ikr-supabase/backup.env}"
[ -f "$CONF" ] && set -a && . "$CONF" && set +a
: "${COMPOSE_DIR:=/opt/ikr-supabase}" "${BACKUP_BUCKET:?нет BACKUP_BUCKET}" "${AGE_RECIPIENT:?нет AGE_RECIPIENT (открытый ключ age)}"
: "${BACKUP_KEEP_DAYS:=14}" "${BACKUP_PREFIX:=supabase-db}" "${WORK:=/var/backups/ikr-supabase}" "${KEEP_LOCAL:=2}"
log() { echo "[$(date '+%F %T')] $*"; }
# Запуск из папки сборки: docker compose сам подхватит docker-compose.override.yml, если он есть
dc() { (cd "$COMPOSE_DIR" && docker compose "$@"); }

install -d -m 0700 "$WORK"
STAMP=$(date -u +%Y%m%d-%H%M%S)
NAME="ikr-$STAMP.dump"
TMP="$WORK/$NAME.tmp"
HOLDER=""
cleanup() {
  rm -f "$TMP"
  [ -n "$HOLDER" ] && { kill "$HOLDER" 2>/dev/null || true; wait "$HOLDER" 2>/dev/null || true; }
  dc exec -T db psql -X -q -U supabase_admin -d postgres -c \
    "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'ikr-backup-snapshot'" >/dev/null 2>&1 || true
  dc exec -T db rm -f /tmp/ikr-snap /tmp/ikr-counts >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Копия и подсчёт записей берутся из одного снимка базы: открываем транзакцию, экспортируем снимок,
# считаем записи и держим транзакцию открытой, пока pg_dump снимает копию по этому же снимку.
# Так проверка восстановления не даёт ложной ошибки, если ночью кто-то отправил заявку.
dc exec -T db rm -f /tmp/ikr-snap /tmp/ikr-counts
{ echo "begin isolation level repeatable read read only;"
  echo "\\o /tmp/ikr-snap"
  echo "select pg_export_snapshot();"
  echo "\\o /tmp/ikr-counts"
  cat "$COMPOSE_DIR/scripts/counts.sql"
  echo "\\o"
  echo "select pg_sleep(3600);"
} | dc exec -T -e PGAPPNAME=ikr-backup-snapshot db psql -X -q -At -U supabase_admin -d postgres >/dev/null 2>&1 &
HOLDER=$!
for i in $(seq 1 60); do
  dc exec -T db test -s /tmp/ikr-counts 2>/dev/null && break
  sleep 1
done
SNAP=$(dc exec -T db cat /tmp/ikr-snap 2>/dev/null | tr -d '[:space:]')
COUNTS=$(dc exec -T db cat /tmp/ikr-counts 2>/dev/null | tr -d '\n')
[ -n "$SNAP" ] && [ -n "$COUNTS" ] || { log "ОШИБКА: не удалось открыть снимок базы"; exit 1; }

log "копия базы: pg_dump (снимок $SNAP)"
# --create: в копии есть и сама база с её настройками — восстановление создаёт её заново целиком
dc exec -T db pg_dump -U supabase_admin -d postgres --create --snapshot="$SNAP" -Fc -Z 6 > "$TMP"
[ -s "$TMP" ] || { log "ОШИБКА: пустая копия"; exit 1; }
dc exec -T db pg_restore --list < "$TMP" > /dev/null || { log "ОШИБКА: копия не читается pg_restore"; exit 1; }

age -r "$AGE_RECIPIENT" -o "$WORK/$NAME.age" "$TMP"
sha256sum "$WORK/$NAME.age" | awk '{print $1}' > "$WORK/$NAME.age.sha256"
printf '%s\n' "$COUNTS" > "$WORK/$NAME.counts.json"
SIZE=$(stat -c %s "$WORK/$NAME.age")

log "выгрузка в S3: $BACKUP_BUCKET/$BACKUP_PREFIX/$NAME.age ($SIZE байт)"
for f in "$NAME.age" "$NAME.age.sha256" "$NAME.counts.json"; do
  rclone copyto --s3-no-check-bucket "$WORK/$f" "backup:$BACKUP_BUCKET/$BACKUP_PREFIX/$f"
done
REMOTE=$(rclone size --json "backup:$BACKUP_BUCKET/$BACKUP_PREFIX/$NAME.age" | jq .bytes)
[ "$REMOTE" = "$SIZE" ] || { log "ОШИБКА: размер в S3 ($REMOTE) не совпадает с локальным ($SIZE)"; exit 1; }
log "копия выгружена и сверена"

# Срок хранения: удаляются только копии базы старше BACKUP_KEEP_DAYS дней и только в своей папке
if [ "$BACKUP_KEEP_DAYS" -gt 0 ]; then
  rclone delete --min-age "${BACKUP_KEEP_DAYS}d" --include 'ikr-*' "backup:$BACKUP_BUCKET/$BACKUP_PREFIX/"
  log "копии старше $BACKUP_KEEP_DAYS дн. удалены; осталось: $(rclone lsf --include 'ikr-*.dump.age' "backup:$BACKUP_BUCKET/$BACKUP_PREFIX/" | wc -l)"
fi
# Локально — только последние KEEP_LOCAL копий (зашифрованные)
ls -1t "$WORK"/ikr-*.dump.age 2>/dev/null | tail -n +$((KEEP_LOCAL + 1)) | while read -r f; do rm -f "$f" "$f.sha256" "${f%.age}.counts.json"; done

if [ "${FILES_BACKUP:-0}" = 1 ]; then
  log "копия файлов кандидатов: $FILES_BUCKET → $BACKUP_BUCKET/files (новые и изменённые, без удаления)"
  rclone copy --s3-no-check-bucket --checksum "files:$FILES_BUCKET" "backup:$BACKUP_BUCKET/files"
fi
log "готово"
