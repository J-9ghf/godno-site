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
dc() { docker compose --project-directory "$COMPOSE_DIR" -f "$COMPOSE_DIR/docker-compose.yml" "$@"; }

install -d -m 0700 "$WORK"
STAMP=$(date -u +%Y%m%d-%H%M%S)
NAME="ikr-$STAMP.dump"
TMP="$WORK/$NAME.tmp"
trap 'rm -f "$TMP"' EXIT

log "копия базы: pg_dump"
dc exec -T db pg_dump -U supabase_admin -d postgres -Fc -Z 6 > "$TMP"
[ -s "$TMP" ] || { log "ОШИБКА: пустая копия"; exit 1; }
dc exec -T db pg_restore --list < "$TMP" > /dev/null || { log "ОШИБКА: копия не читается pg_restore"; exit 1; }

# Сколько строк было в момент копии — по этому числу проверка восстановления сверяет результат
COUNTS=$(dc exec -T db psql -U supabase_admin -d postgres -Atc "
  select json_object_agg(t, n) from (
    select 'auth.users' t, count(*) n from auth.users union all
    select 'storage.objects', count(*) from storage.objects union all
    select 'public.tables', count(*) from pg_tables where schemaname = 'public') x")

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
