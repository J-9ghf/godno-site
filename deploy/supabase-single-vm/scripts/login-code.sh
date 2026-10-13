#!/usr/bin/env bash
# Пока почта не настроена (EMAIL_PROVIDER=console), код второго шага входа админа и ссылка
# восстановления пароля попадают только в журнал сервера. Скрипт показывает последний код для почты
# за 10 минут (столько код действует).
# Запуск от root: bash /opt/ikr-supabase/scripts/login-code.sh admin@example.ru
set -euo pipefail
EMAIL="${1:?укажите почту, на которую должен был прийти код}"
code=$(journalctl -u ikr-app --since "-10 min" -o cat 2>/dev/null \
  | grep -A1 -F "[email] to=$EMAIL" | grep -oE 'Код входа: [0-9]{6}' | tail -1 || true)
if [ -n "$code" ]; then echo "$code (действует 10 минут с момента отправки)"; else
  echo "За последние 10 минут кода для $EMAIL нет. Войдите паролем ещё раз — код придёт заново."; exit 1; fi
