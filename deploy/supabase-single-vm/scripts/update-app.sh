#!/usr/bin/env bash
# Обновление приложения ИКР до последней версии из репозитория:
#  1) скачивает изменения (только «вперёд», без перезаписи истории);
#  2) копия базы в S3 и новые миграции (migrate.sh делает копию сам, если есть новые миграции);
#  3) сборка в отдельной папке; если сборка не удалась — работающая версия не трогается, сайт работает дальше;
#  4) перезапуск службы и проверка, что сайт открывается.
# Запуск от root: bash /opt/ikr-supabase/scripts/update-app.sh
set -euo pipefail
REPO="${IKR_REPO:-/opt/ikr/app}"
STACK="${COMPOSE_DIR:-/opt/ikr-supabase}"
HTTPS_PORT="${HTTPS_PORT:-443}"
log() { echo "[$(date '+%F %T')] $*"; }
app() { # app stop|start — служба ikr-app; без systemd (проверочная среда) — тот же запуск в фоне
  if [ -d /run/systemd/system ]; then systemctl "$1" ikr-app; return; fi
  pkill -f '[n]ext/dist/bin/next start' 2>/dev/null || true; sleep 2
  [ "$1" = start ] && nohup setsid bash -c "set -a; . /etc/ikr/app.env; set +a; cd '$REPO'; exec runuser -u ikr -- node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000" \
    > /var/log/ikr-app.log 2>&1 < /dev/null &
  return 0
}
cd "$REPO"
OLD=$(git rev-parse --short HEAD)
git pull --ff-only -q
NEW=$(git rev-parse --short HEAD)
log "версия: $OLD → $NEW"
# Свежие скрипты и настройки сборки Supabase (кроме .env — он остаётся как есть)
cp -r "$REPO/deploy/supabase-single-vm/scripts/." "$STACK/scripts/"
bash "$STACK/scripts/migrate.sh" "$REPO/supabase"

log "сборка (в отдельной папке, работающая версия пока не меняется)"
BUILD=/opt/ikr/build
install -d "$BUILD"
rsync -a --delete --exclude .git --exclude .next --exclude node_modules "$REPO/" "$BUILD/"
if ! (cd "$BUILD" && npm ci --no-audit --no-fund && npm run build) > /var/log/ikr-build.log 2>&1; then
  log "ОШИБКА сборки — сайт работает на прежней версии. Подробности: /var/log/ikr-build.log"
  exit 1
fi
chown -R ikr:ikr "$BUILD/.next"
# Замена собранной версии: секунды простоя
app stop
rm -rf "$REPO/.next.old" "$REPO/node_modules.old"
mv "$REPO/.next" "$REPO/.next.old" 2>/dev/null || true
mv "$REPO/node_modules" "$REPO/node_modules.old" 2>/dev/null || true
mv "$BUILD/.next" "$REPO/.next"
mv "$BUILD/node_modules" "$REPO/node_modules"
rm -rf "$REPO/.next.old" "$REPO/node_modules.old"
app start
if COMPOSE_DIR="$STACK" bash "$STACK/scripts/health.sh"; then log "ГОТОВО: версия $NEW"; else
  log "после обновления сайт работает не полностью — журнал: journalctl -u ikr-app -n 50"; exit 1; fi
