#!/usr/bin/env bash
# Проверка, что платформа работает: главная страница (читает справочник из базы через Supabase) и страница
# входа открываются, приложение видит свои настройки, вход (Auth) отвечает. Ждёт до WAIT секунд (по умолчанию 120).
# Код выхода 0 — всё в порядке. Запуск: bash scripts/health.sh
set -uo pipefail
DIR="${COMPOSE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
HTTPS_PORT="${HTTPS_PORT:-443}"
WAIT="${WAIT:-120}"
DOMAIN=$(grep -m1 '^DOMAIN=' "$DIR/.env" | cut -d= -f2- | tr -d "'\"")
base="https://$DOMAIN"; [ "$HTTPS_PORT" = 443 ] || base="$base:$HTTPS_PORT"
c() { curl -s --noproxy '*' -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:$HTTPS_PORT:127.0.0.1" \
  $([ "${LOCAL_TEST:-0}" = 1 ] && echo -k) "$@"; }
deadline=$(( $(date +%s) + WAIT ))
while :; do
  home=$(c "$base/"); login=$(c "$base/login"); auth=$(c "$base/auth/v1/health"); ping=$(c -X POST "$base/api/session/ping")
  # без входа служебный адрес отвечает 401; 500 — приложение не видит настройки или Supabase
  if [ "$home" = 200 ] && [ "$login" = 200 ] && [ "$auth" = 200 ] && [ "$ping" = 401 ]; then
    echo "сайт работает: $base (главная $home, страница входа $login, вход $auth, приложение и Supabase на связи)"
    exit 0
  fi
  [ "$(date +%s)" -ge "$deadline" ] && break
  sleep 3
done
echo "ПРОБЛЕМА: главная $home (ждём 200), страница входа $login (ждём 200), Auth $auth (ждём 200), служебный адрес $ping (ждём 401)."
[ "$login" = 000 ] && echo "Сайт не отвечает: DNS ещё не указывает на машину или сертификат не выпущен (подождите 10–30 минут)."
{ [ "$ping" = 500 ] || [ "$home" = 500 ]; } && echo "Приложение не видит настройки или Supabase: journalctl -u ikr-app -n 50"
exit 1
