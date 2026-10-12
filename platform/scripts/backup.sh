#!/usr/bin/env bash
# Резервная копия базы в формате pg_dump (custom), с проверкой целостности архива.
# Использование: DATABASE_OWNER_URL=... ./scripts/backup.sh [папка]
# В облаке основная защита — автоматические копии Managed PostgreSQL с восстановлением на момент времени;
# этот скрипт — дополнительная логическая копия (например, раз в неделю в отдельный закрытый бакет).
set -euo pipefail
: "${DATABASE_OWNER_URL:?Нужна переменная DATABASE_OWNER_URL}"
DIR="${1:-backups}"; mkdir -p "$DIR"; chmod 700 "$DIR"
FILE="$DIR/ikr-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --file="$FILE" "$DATABASE_OWNER_URL"
chmod 600 "$FILE"
pg_restore --list "$FILE" > /dev/null    # архив читается
sha256sum "$FILE" > "$FILE.sha256"
echo "$FILE"
