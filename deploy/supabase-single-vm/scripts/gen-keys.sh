#!/usr/bin/env bash
# Создаёт секреты в .env на сервере: пароль базы, JWT_SECRET и ключи anon / service_role (JWT, подпись HS256).
# Значения не выводятся на экран. Повторный запуск ничего не меняет, если секреты уже заданы (--force — заменить:
# только до первого запуска базы, иначе пароли служебных ролей разойдутся с базой).
set -euo pipefail
ENV_FILE="${1:-/opt/ikr-supabase/.env}"
[ -f "$ENV_FILE" ] || { echo "Нет $ENV_FILE: скопируйте .env.example и заполните адреса и S3" >&2; exit 1; }
FORCE="${2:-}"
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() { # $1 — роль
  local now exp header payload sig
  now=$(date +%s); exp=$((now + 10 * 365 * 24 * 3600))
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$now" "$exp" | b64url)
  sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
  printf '%s.%s.%s' "$header" "$payload" "$sig"
}
set_var() { # $1 — имя, $2 — значение
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1='$2'|" "$ENV_FILE"; else echo "$1='$2'" >> "$ENV_FILE"; fi
}
current() { grep "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d "'\""; }
if [ "$(current JWT_SECRET)" != "ЗАПОЛНИТЕЛЬ" ] && [ -n "$(current JWT_SECRET)" ] && [ "$FORCE" != "--force" ]; then
  echo "Секреты уже заданы — ничего не меняю"; exit 0
fi
umask 077
set_var POSTGRES_PASSWORD "$(openssl rand -hex 24)"
JWT_SECRET="$(openssl rand -hex 32)"
set_var JWT_SECRET "$JWT_SECRET"
set_var ANON_KEY "$(jwt anon)"
set_var SERVICE_ROLE_KEY "$(jwt service_role)"
chmod 600 "$ENV_FILE"
echo "Готово: пароль базы, JWT_SECRET, ANON_KEY и SERVICE_ROLE_KEY записаны в $ENV_FILE (права 600)."
echo "Ключ SERVICE_ROLE_KEY — полный доступ к данным: только на сервере, никогда в браузер и в чат."
