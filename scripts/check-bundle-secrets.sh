#!/usr/bin/env bash
# Проверяет, что ключи Supabase не попали в браузерный бандл (.next/static). Запускать после next build.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .next/static ] || { echo "Сначала next build"; exit 1; }
fail=0
for name in SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY SMTP_PASSWORD; do
  value="${!name:-}"
  if grep -rqF "$name" .next/static; then echo "✗ имя $name найдено в бандле"; fail=1; fi
  if [ -n "$value" ] && grep -rqF "$value" .next/static; then echo "✗ значение $name найдено в бандле"; fail=1; fi
done
[ $fail -eq 0 ] && echo "✓ секретов в браузерном бандле нет"
exit $fail
