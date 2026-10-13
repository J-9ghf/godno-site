#!/usr/bin/env bash
# Обновление сервисов Supabase (вариант 1). Версии образов закреплены в docker-compose.yml:
# чтобы обновиться, меняют теги на новые из официального docker-compose Supabase, затем запускают этот скрипт.
#  1. внеочередная копия базы в S3 (без неё обновление не начинается);
#  2. загрузка новых образов и перезапуск только изменившихся сервисов;
#  3. ожидание, пока все сервисы станут «healthy»; если нет — вывод журналов и код ошибки.
# Смена основной версии PostgreSQL (например, 17 → 18) так НЕ делается: нужна отдельная процедура pg_upgrade.
set -euo pipefail
DIR="${COMPOSE_DIR:-/opt/ikr-supabase}"
# Запуск из папки сборки: docker compose сам подхватит docker-compose.override.yml, если он есть
dc() { (cd "$DIR" && docker compose "$@"); }
echo "1/3 копия базы перед обновлением"
bash "$DIR/scripts/backup-db.sh"
echo "2/3 новые образы и перезапуск"
dc pull -q
dc up -d --remove-orphans
echo "3/3 проверка здоровья"
for i in $(seq 1 60); do
  bad=$(dc ps --format '{{.Service}} {{.Health}}' | awk '$2 != "" && $2 != "healthy"' || true)
  [ -z "$bad" ] && { dc ps --format '{{.Service}}: {{.Status}}'; echo "Обновление завершено"; exit 0; }
  sleep 5
done
echo "ОШИБКА: не все сервисы здоровы:"; echo "$bad"; dc logs --tail 50; exit 1
