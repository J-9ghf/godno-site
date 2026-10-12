#!/usr/bin/env bash
# Локальный PostgreSQL без Docker: ./scripts/dev-db.sh start|stop|status|psql
# Данные лежат в platform/.dev/pg (папка в .gitignore). Только для разработки.
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || PGBIN="$(dirname "$(command -v initdb)")"
DATA=".dev/pg"; PORT="${PGPORT:-54329}"
# PostgreSQL не запускается от root: в контейнерах разработки используем системного пользователя postgres
AS=""; if [ "$(id -u)" = 0 ]; then AS="runuser -u postgres --"; fi
case "${1:-start}" in
  start)
    if [ ! -d "$DATA" ]; then
      mkdir -p .dev/pg && [ -n "$AS" ] && chown postgres .dev/pg .dev; $AS "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
      echo "listen_addresses = '127.0.0.1'" | $AS tee -a "$DATA/postgresql.conf" >/dev/null
    fi
    $AS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l .dev/pg/server.log -w start >/dev/null
    psql -h 127.0.0.1 -p "$PORT" -U postgres -tc "select 1 from pg_database where datname='ikr'" | grep -q 1 || {
      psql -h 127.0.0.1 -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 \
        -v owner_password="${DB_OWNER_PASSWORD:-$(openssl rand -hex 24)}" -v app_password="${DB_APP_PASSWORD:-$(openssl rand -hex 24)}" -f db/bootstrap.sql; }
    echo "PostgreSQL: 127.0.0.1:$PORT, база ikr";;
  stop) $AS "$PGBIN/pg_ctl" -D "$DATA" -w stop >/dev/null && echo stopped;;
  status) $AS "$PGBIN/pg_ctl" -D "$DATA" status;;
  psql) shift; psql -h 127.0.0.1 -p "$PORT" -U postgres -d ikr "$@";;
esac
