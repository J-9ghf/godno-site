#!/usr/bin/env bash
# Установка платформы ИКР на новую машину Ubuntu 24.04 (Selectel). Запуск от root из скачанного репозитория:
#   bash /opt/ikr/app/deploy/supabase-single-vm/scripts/install.sh
# Скрипт задаёт вопросы (домен, ключи S3, открытый ключ копий) и делает всё остальное:
#  1) пакеты: Docker, Node.js 22, age, rclone, автоматические обновления безопасности;
#  2) брандмауэр: снаружи открыты только SSH, 80 и 443;
#  3) Supabase (Postgres, Auth, PostgREST, Storage, Caddy) в /opt/ikr-supabase, пароли и ключи — на месте;
#  4) миграции базы (без демо-данных);
#  5) приложение: сборка и служба ikr-app;
#  6) ежедневные копии базы в S3 и первая копия сразу;
#  7) проверка, что сайт открывается.
# Повторный запуск безопасен: готовые шаги пропускаются, пароли и ключи не меняются.
# Ответы можно передать заранее переменными IKR_DOMAIN, IKR_S3_ENDPOINT, IKR_S3_REGION, IKR_FILES_BUCKET,
# IKR_BACKUP_BUCKET, IKR_S3_KEY_ID, IKR_S3_SECRET, IKR_AGE_RECIPIENT (тогда вопросов не будет).
# LOCAL_TEST=1 — только для проверки на своей машине (домен localhost, сертификат Caddy без Let's Encrypt).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Запустите от root (sudo -i)"; exit 1; }
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
BUNDLE="$REPO/deploy/supabase-single-vm"
STACK="${COMPOSE_DIR:-/opt/ikr-supabase}"
APP_ENV=/etc/ikr/app.env
BACKUP_ENV_FILE="${BACKUP_ENV:-/etc/ikr-supabase/backup.env}"
HTTPS_PORT="${HTTPS_PORT:-443}"
LOCAL_TEST="${LOCAL_TEST:-0}"
step() { echo; echo "═══ $* ═══"; }
dc() { (cd "$STACK" && docker compose "$@"); }
has_systemd() { [ -d /run/systemd/system ]; }
# Ответы читаются с терминала, а не со стандартного ввода: его могут прочитать npm и docker.
# IKR_INPUT — файл с ответами (только для автоматической проверки).
rd() {
  [ -n "${_IN_OPEN:-}" ] || { exec 3<"${IKR_INPUT:-/dev/tty}"; _IN_OPEN=1; }
  read -r -u 3 "$@"
}
ask() { # ask VAR "вопрос" [по умолчанию] [secret]
  local var=$1 q=$2 def=${3:-} secret=${4:-} val
  val="${!var:-}"
  if [ -z "$val" ]; then
    if [ -n "$secret" ]; then rd -s -p "$q: " val; echo; else rd -p "$q${def:+ [$def]}: " val; fi
    val="${val:-$def}"
  fi
  [ -n "$val" ] || { echo "Нужен ответ: $q"; exit 1; }
  printf -v "$var" '%s' "$val"
}
set_env() { # set_env файл КЛЮЧ значение — значение в одинарных кавычках, без вывода на экран
  python3 - "$1" "$2" "$3" <<'PY'
import re, sys
path, key, val = sys.argv[1:]
text = open(path).read()
line = key + "='" + val.replace("'", "'\"'\"'") + "'"
text, n = re.subn(r'(?m)^' + re.escape(key) + r'=.*$', lambda m: line, text)
if not n: text += ('' if text.endswith('\n') else '\n') + line + '\n'
open(path, 'w').write(text)
PY
}
get_env() { grep -m1 "^$2=" "$1" | cut -d= -f2- | sed "s/^'//; s/'\$//"; }

step "1. Пакеты"
if [ "${SKIP_PACKAGES:-0}" != 1 ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y -q ca-certificates curl gnupg git jq age rclone rsync ufw unattended-upgrades python3 >/dev/null
  if ! command -v docker >/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -q && apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
  fi
  if ! node -v 2>/dev/null | grep -q '^v22\.'; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -q nodejs >/dev/null
  fi
  dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
fi
# Московское время: ночная копия по таймеру — в 03:30 по Москве
has_systemd && timedatectl set-timezone Europe/Moscow 2>/dev/null || true
echo "Docker $(docker --version | awk '{print $3}' | tr -d ,), Node.js $(node -v)"

step "2. Брандмауэр"
if [ "${SKIP_FIREWALL:-0}" != 1 ]; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  # Caddy в Docker обращается к приложению на порт 3000 машины; снаружи этот порт закрыт
  ufw allow from 172.16.0.0/12 to any port 3000 proto tcp >/dev/null
  ufw --force enable >/dev/null
  ufw status | sed -n '1,12p'
fi

step "3. Supabase: файлы и настройки"
install -d -m 0750 "$STACK"
cp -r "$BUNDLE"/. "$STACK"/
chmod +x "$STACK"/scripts/*.sh
if [ ! -f "$STACK/.env" ]; then
  ask IKR_DOMAIN "Домен сайта (например, ikr.example.ru), DNS уже указывает на эту машину"
  ask IKR_S3_ENDPOINT "Адрес S3" "https://s3.ru-1.storage.selcloud.ru"
  ask IKR_S3_REGION "Регион S3" "ru-1"
  ask IKR_FILES_BUCKET "Бакет для файлов кандидатов" "ikr-files"
  ask IKR_S3_KEY_ID "Access key S3 (ключ доступа)"
  ask IKR_S3_SECRET "Secret key S3 (на экране не отображается)" "" secret
  install -m 0600 "$STACK/.env.example" "$STACK/.env"
  set_env "$STACK/.env" DOMAIN "$IKR_DOMAIN"
  if [ "$HTTPS_PORT" = 443 ]; then base="https://$IKR_DOMAIN"; else base="https://$IKR_DOMAIN:$HTTPS_PORT"; fi
  set_env "$STACK/.env" PUBLIC_URL "$base"
  set_env "$STACK/.env" SITE_URL "$base"
  set_env "$STACK/.env" S3_ENDPOINT "$IKR_S3_ENDPOINT"
  set_env "$STACK/.env" S3_PROTOCOL "${IKR_S3_ENDPOINT%%://*}"
  set_env "$STACK/.env" S3_REGION "$IKR_S3_REGION"
  set_env "$STACK/.env" S3_BUCKET "$IKR_FILES_BUCKET"
  set_env "$STACK/.env" S3_ACCESS_KEY_ID "$IKR_S3_KEY_ID"
  set_env "$STACK/.env" S3_SECRET_ACCESS_KEY "$IKR_S3_SECRET"
fi
bash "$STACK/scripts/gen-keys.sh" "$STACK/.env"
DOMAIN=$(get_env "$STACK/.env" DOMAIN)
PUBLIC_URL=$(get_env "$STACK/.env" PUBLIC_URL)

step "4. Supabase: запуск"
if ! dc pull -q; then
  echo "Не удалось скачать образы (Docker Hub недоступен или ограничил скачивание)."
  dc config --images | while read -r img; do docker image inspect "$img" >/dev/null 2>&1 \
    || { echo "Образа $img нет на машине — повторите установку позже"; exit 1; }; done
  echo "Все образы уже есть на машине — продолжаю с ними."
fi
dc up -d
for i in $(seq 1 60); do
  bad=$(dc ps --format '{{.Service}} {{.Health}}' | awk '$2 != "" && $2 != "healthy"' || true)
  [ -z "$bad" ] && break; sleep 3
done
[ -z "$bad" ] || { echo "Не все сервисы запустились:"; echo "$bad"; dc logs --tail 30; exit 1; }
dc ps --format '{{.Service}}: {{.Status}}'

step "5. База: миграции"
bash "$STACK/scripts/migrate.sh" "$REPO/supabase" --no-backup

step "6. Приложение"
# Приложение обращается к Supabase по адресу сайта: на этой машине он указывает сюда же
grep -qE "^127\.0\.0\.1[[:space:]]+$DOMAIN\$" /etc/hosts || echo "127.0.0.1 $DOMAIN" >> /etc/hosts
install -d -m 0750 /etc/ikr
[ -f "$APP_ENV" ] || { install -m 0600 /dev/null "$APP_ENV"; set_env "$APP_ENV" APP_SECRET "$(openssl rand -base64 48 | tr -d '\n')"; }
set_env "$APP_ENV" NODE_ENV production
set_env "$APP_ENV" APP_URL "$PUBLIC_URL"
set_env "$APP_ENV" SUPABASE_URL "$PUBLIC_URL"
set_env "$APP_ENV" SUPABASE_ANON_KEY "$(get_env "$STACK/.env" ANON_KEY)"
set_env "$APP_ENV" SUPABASE_SERVICE_ROLE_KEY "$(get_env "$STACK/.env" SERVICE_ROLE_KEY)"
grep -q '^EMAIL_PROVIDER=' "$APP_ENV" || set_env "$APP_ENV" EMAIL_PROVIDER console
grep -q '^CAPTCHA_PROVIDER=' "$APP_ENV" || set_env "$APP_ENV" CAPTCHA_PROVIDER off
grep -q '^RESUME_FORM_MODE=' "$APP_ENV" || set_env "$APP_ENV" RESUME_FORM_MODE test
if [ "$LOCAL_TEST" = 1 ]; then  # проверочный стенд: доверять локальному сертификату Caddy
  dc cp gateway:/data/caddy/pki/authorities/local/root.crt /usr/local/share/ikr-caddy-local-root.crt >/dev/null
  chmod 644 /usr/local/share/ikr-caddy-local-root.crt
  set_env "$APP_ENV" NODE_EXTRA_CA_CERTS /usr/local/share/ikr-caddy-local-root.crt
fi
id ikr >/dev/null 2>&1 || useradd --system --home-dir /opt/ikr --shell /usr/sbin/nologin ikr
(cd "$REPO" && npm ci --no-audit --no-fund && npm run build) > /var/log/ikr-build.log 2>&1 \
  || { echo "Сборка не удалась, подробности: /var/log/ikr-build.log"; tail -20 /var/log/ikr-build.log; exit 1; }
chown -R ikr:ikr "$REPO/.next"
echo "сборка готова"
if has_systemd; then
  install -m 0644 "$BUNDLE/systemd/ikr-app.service" /etc/systemd/system/ikr-app.service
  systemctl daemon-reload
  systemctl enable ikr-app >/dev/null 2>&1
  systemctl restart ikr-app
else
  # Без systemd (проверочная среда в контейнере): тот же запуск, что в службе, в фоне
  pkill -f '[n]ext/dist/bin/next start' 2>/dev/null || true; sleep 2
  # Настройки читает root (как systemd), приложение работает от пользователя ikr
  nohup setsid bash -c "set -a; . '$APP_ENV'; set +a; cd '$REPO'; exec runuser -u ikr -- node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000" \
    > /var/log/ikr-app.log 2>&1 < /dev/null &
  echo "systemd нет: приложение запущено в фоне, журнал /var/log/ikr-app.log"
fi

step "7. Копии базы в S3"
if [ ! -f "$BACKUP_ENV_FILE" ]; then
  ask IKR_BACKUP_BUCKET "Бакет для копий базы" "ikr-backup"
  if [ -z "${IKR_AGE_RECIPIENT:-}" ]; then
    rd -p "Ключа для шифрования копий ещё нет? Создать сейчас (д/н) [д]: " gen
    if [ "${gen:-д}" != н ]; then
      KEYDIR=$(mktemp -d); KEYTMP="$KEYDIR/backup-key.txt"   # папка доступна только root
      age-keygen -o "$KEYTMP" 2>/dev/null || { echo "Не удалось создать ключ (age-keygen)"; exit 1; }
      IKR_AGE_RECIPIENT=$(grep -m1 '^# public key:' "$KEYTMP" | awk '{print $4}')
      echo
      echo "Ключ для восстановления копий. Сохраните ВСЕ три строки в менеджер паролей (или распечатайте и уберите в сейф)."
      echo "Без него копии не расшифровать. На сервере ключ НЕ остаётся."
      echo "────────────────────────────────────────"
      cat "$KEYTMP"
      echo "────────────────────────────────────────"
      until [ "${saved:-}" = СОХРАНИЛ ]; do rd -p "Когда сохраните, напечатайте СОХРАНИЛ: " saved || exit 1; done
      shred -u "$KEYTMP" 2>/dev/null || rm -f "$KEYTMP"; rmdir "$KEYDIR"
      clear 2>/dev/null || true
    fi
  fi
  ask IKR_AGE_RECIPIENT "Открытый ключ для шифрования копий (строка age1…)"
  [[ "$IKR_AGE_RECIPIENT" == age1* ]] || { echo "Открытый ключ должен начинаться с age1"; exit 1; }
  install -d -m 0750 "$(dirname "$BACKUP_ENV_FILE")"
  install -m 0600 "$STACK/backup.env.example" "$BACKUP_ENV_FILE"
  set_env "$BACKUP_ENV_FILE" COMPOSE_DIR "$STACK"
  set_env "$BACKUP_ENV_FILE" BACKUP_BUCKET "$IKR_BACKUP_BUCKET"
  set_env "$BACKUP_ENV_FILE" AGE_RECIPIENT "$IKR_AGE_RECIPIENT"
  for r in BACKUP FILES; do
    set_env "$BACKUP_ENV_FILE" "RCLONE_CONFIG_${r}_ENDPOINT" "$(get_env "$STACK/.env" S3_ENDPOINT)"
    set_env "$BACKUP_ENV_FILE" "RCLONE_CONFIG_${r}_REGION" "$(get_env "$STACK/.env" S3_REGION)"
    set_env "$BACKUP_ENV_FILE" "RCLONE_CONFIG_${r}_ACCESS_KEY_ID" "$(get_env "$STACK/.env" S3_ACCESS_KEY_ID)"
    set_env "$BACKUP_ENV_FILE" "RCLONE_CONFIG_${r}_SECRET_ACCESS_KEY" "$(get_env "$STACK/.env" S3_SECRET_ACCESS_KEY)"
  done
  set_env "$BACKUP_ENV_FILE" FILES_BUCKET "$(get_env "$STACK/.env" S3_BUCKET)"
fi
grep -q '^RCLONE_CONFIG=' "$BACKUP_ENV_FILE" || set_env "$BACKUP_ENV_FILE" RCLONE_CONFIG /dev/null
if has_systemd; then
  install -m 0644 "$STACK"/systemd/ikr-supabase-backup.* /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now ikr-supabase-backup.timer >/dev/null 2>&1
  echo "копии по расписанию: каждый день около 03:30 по Москве"
fi
BACKUP_ENV="$BACKUP_ENV_FILE" COMPOSE_DIR="$STACK" bash "$STACK/scripts/backup-db.sh"

step "8. Проверка"
if COMPOSE_DIR="$STACK" HTTPS_PORT="$HTTPS_PORT" WAIT=300 bash "$STACK/scripts/health.sh"; then
  echo "ГОТОВО. Следующий шаг — первый администратор:"
  echo "  bash $STACK/scripts/create-admin.sh почта@администратора \"Имя Фамилия\""
else
  echo "Журналы: docker compose -f $STACK/docker-compose.yml logs gateway; journalctl -u ikr-app -n 50"
  exit 1
fi
