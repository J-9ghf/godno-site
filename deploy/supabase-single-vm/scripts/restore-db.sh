#!/usr/bin/env bash
# Восстановление РАБОЧЕЙ базы из копии в S3. Сайт и кабинеты на время восстановления недоступны (5–15 минут).
#  1. скачивает копию (последнюю или указанную), сверяет контрольную сумму, расшифровывает ключом age;
#  2. делает страховочную копию текущей базы (зашифрованную, в /var/backups/ikr-supabase/before-restore-*);
#  3. останавливает приложение и сервисы Supabase, пересоздаёт базу и загружает в неё копию;
#  4. сверяет число записей с тем, что было записано при копировании, и запускает всё обратно;
#  5. проверяет, что сайт открывается.
# Файлы кандидатов лежат в S3 и не меняются: файлы, загруженные после копии, останутся в хранилище без записей о них.
# Запуск: bash scripts/restore-db.sh /путь/к/закрытому-ключу-age [имя-копии.dump.age] [--yes]
set -euo pipefail
KEY="${1:?укажите путь к закрытому ключу age}"
shift
WANT_NAME=""; YES=0
for a in "$@"; do
  case "$a" in
    --yes) YES=1 ;;
    *) WANT_NAME="$a" ;;
  esac
done
CONF="${BACKUP_ENV:-/etc/ikr-supabase/backup.env}"
[ -f "$CONF" ] && set -a && . "$CONF" && set +a
: "${COMPOSE_DIR:=/opt/ikr-supabase}" "${BACKUP_BUCKET:?нет BACKUP_BUCKET}" "${BACKUP_PREFIX:=supabase-db}"
: "${AGE_RECIPIENT:?нет AGE_RECIPIENT}" "${WORK:=/var/backups/ikr-supabase}" "${APP_SERVICE:=ikr-app}" "${HTTPS_PORT:=443}"
log() { echo "[$(date '+%F %T')] $*"; }
# Запуск из папки сборки: docker compose сам подхватит docker-compose.override.yml, если он есть
dc() { (cd "$COMPOSE_DIR" && docker compose "$@"); }
has_systemd() { command -v systemctl >/dev/null && systemctl list-unit-files "$APP_SERVICE.service" >/dev/null 2>&1; }
[ -r "$KEY" ] || { log "ОШИБКА: нет файла ключа $KEY"; exit 1; }

TMP=$(mktemp -d); chmod 700 "$TMP"
STARTED=0
finish() {
  rm -rf "$TMP"
  # Если что-то пошло не так после остановки — всё равно поднимаем сервисы, чтобы сайт не остался выключенным
  if [ "$STARTED" = 1 ]; then dc up -d >/dev/null 2>&1 || true; has_systemd && systemctl start "$APP_SERVICE" || true; fi
}
trap finish EXIT

# 1. Копия из S3: указанная, или выбор из последних 10 (с --yes — самая свежая)
if [ -n "$WANT_NAME" ]; then NAME="$WANT_NAME"; else
  mapfile -t LIST < <(rclone lsf --include 'ikr-*.dump.age' "backup:$BACKUP_BUCKET/$BACKUP_PREFIX/" | sort | tail -10)
  [ ${#LIST[@]} -gt 0 ] || { log "ОШИБКА: в S3 нет копий"; exit 1; }
  NAME="${LIST[-1]}"
  if [ "$YES" != 1 ]; then
    echo "Копии базы (время — UTC, московское = UTC + 3 часа):"
    for i in "${!LIST[@]}"; do
      n="${LIST[$i]}"; t="${n#ikr-}"; t="${t%%.*}"
      info=$(rclone cat "backup:$BACKUP_BUCKET/$BACKUP_PREFIX/${n%.age}.counts.json" 2>/dev/null \
        | jq -r '"пользователей \(.["auth.users"] // "?"), кандидатов \(.["public.candidates"] // "?"), заявок \(.["public.requests"] // "?")"' 2>/dev/null)
      printf '  %2d) %s.%s.%s %s:%s — %s\n' $((i + 1)) "${t:6:2}" "${t:4:2}" "${t:0:4}" "${t:9:2}" "${t:11:2}" "${info:-без сведений}"
    done
    read -r -p "Номер копии [${#LIST[@]} — самая свежая]: " num
    num="${num:-${#LIST[@]}}"
    [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#LIST[@]} ] || { log "нет копии с номером $num"; exit 1; }
    NAME="${LIST[$((num - 1))]}"
  fi
fi
log "копия: $NAME"
for f in "$NAME" "$NAME.sha256" "${NAME%.age}.counts.json"; do rclone copyto "backup:$BACKUP_BUCKET/$BACKUP_PREFIX/$f" "$TMP/$f"; done
[ "$(sha256sum "$TMP/$NAME" | awk '{print $1}')" = "$(cat "$TMP/$NAME.sha256")" ] || { log "ОШИБКА: контрольная сумма не совпадает"; exit 1; }
age -d -i "$KEY" -o "$TMP/db.dump" "$TMP/$NAME"
dc exec -T db pg_restore --list < "$TMP/db.dump" >/dev/null || { log "ОШИБКА: копия не читается"; exit 1; }
WANT=$(jq -S -c . "$TMP/${NAME%.age}.counts.json")
log "копия проверена и расшифрована; в ней: $WANT"

if [ "$YES" != 1 ]; then
  echo
  echo "ВНИМАНИЕ: текущая база будет заменена копией $NAME."
  echo "Всё, что появилось в базе после этой копии, пропадёт (останется в страховочной копии)."
  read -r -p "Чтобы продолжить, напечатайте ВОССТАНОВИТЬ: " answer
  [ "$answer" = "ВОССТАНОВИТЬ" ] || { log "отменено, ничего не изменено"; exit 1; }
fi

# 2. Страховочная копия текущей базы
install -d -m 0700 "$WORK"
SAFE="$WORK/before-restore-$(date -u +%Y%m%d-%H%M%S).dump.age"
dc exec -T db pg_dump -U supabase_admin -d postgres --create -Fc -Z 6 | age -r "$AGE_RECIPIENT" -o "$SAFE"
log "страховочная копия текущей базы: $SAFE"

# 3. Остановка и пересоздание базы: база удаляется и создаётся из копии целиком (роли и пароли сервисов не меняются)
STARTED=1
has_systemd && systemctl stop "$APP_SERVICE" || true
dc stop auth rest storage gateway >/dev/null
log "сервисы остановлены, пересоздаю базу из копии"
dc exec -T db psql -X -q -U supabase_admin -d template1 -v ON_ERROR_STOP=1 -c "drop database if exists postgres with (force)"
dc exec -T db pg_restore -U supabase_admin -d template1 --create --no-comments --exit-on-error < "$TMP/db.dump" \
  || { log "ОШИБКА: загрузка копии не удалась. Страховочная копия: $SAFE"; exit 1; }

# 4. Сверка и запуск
GOT=$(dc exec -T db psql -X -U supabase_admin -d postgres -At -f - < "$COMPOSE_DIR/scripts/counts.sql" | jq -S -c .)
[ "$GOT" = "$WANT" ] || { log "ОШИБКА: ожидали $WANT, получили $GOT. Страховочная копия: $SAFE"; exit 2; }
log "записи совпали: $GOT"
dc up -d >/dev/null
for i in $(seq 1 60); do
  bad=$(dc ps --format '{{.Service}} {{.Health}}' | awk '$2 != "" && $2 != "healthy"' || true)
  [ -z "$bad" ] && break; sleep 3
done
has_systemd && systemctl start "$APP_SERVICE" || true
STARTED=0

# 5. Сайт работает
if COMPOSE_DIR="$COMPOSE_DIR" HTTPS_PORT="$HTTPS_PORT" bash "$COMPOSE_DIR/scripts/health.sh"; then
  log "ГОТОВО: база восстановлена из $NAME"
else
  log "база восстановлена, но сайт работает не полностью — проверьте приложение: systemctl status $APP_SERVICE"; exit 3
fi
