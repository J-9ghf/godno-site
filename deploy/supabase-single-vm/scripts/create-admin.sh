#!/usr/bin/env bash
# Первый администратор (или новый, если все админы потеряли доступ). Создаёт приглашение с ролью «админ»
# и один раз показывает ссылку в этом окне. По ссылке человек задаёт пароль; дальше вход — пароль + код.
#  - ссылка действует 72 часа и открывается один раз;
#  - в базе хранится только SHA-256 ссылки, в журнал и на диск ссылка не пишется;
#  - прежние неиспользованные приглашения на эту почту отзываются.
# Запуск: bash scripts/create-admin.sh admin@example.com "Имя Фамилия"
set -euo pipefail
EMAIL="${1:?укажите почту администратора}"
FULL_NAME="${2:-}"
DIR="${COMPOSE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
dc() { (cd "$DIR" && docker compose "$@"); }
[[ "$EMAIL" =~ ^[^@[:space:]\']+@[^@[:space:]\']+\.[^@[:space:]\']+$ ]] || { echo "почта выглядит неверно: $EMAIL"; exit 1; }
PUBLIC_URL=$(grep -m1 '^PUBLIC_URL=' "$DIR/.env" | cut -d= -f2- | tr -d "'\"")
[ -n "$PUBLIC_URL" ] || { echo "в $DIR/.env нет PUBLIC_URL"; exit 1; }

TOKEN=$(openssl rand 32 | basenc --base64url | tr -d '=\n')
HASH=$(printf '%s' "$TOKEN" | sha256sum | awk '{print $1}')

# Значения передаются переменными psql (-v), а не вставкой в текст запроса
result=$(dc exec -T db psql -X -q -At -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -v email="$EMAIL" -v full_name="$FULL_NAME" -v token_hash="$HASH" <<'SQL'
select exists (select 1 from public.profiles where lower(email) = lower(:'email')) as is_exists \gset
\if :is_exists
select 'exists';
\else
begin;
update public.invitations set revoked_at = now()
  where lower(email) = lower(:'email') and used_at is null and revoked_at is null;
insert into public.invitations (email, role, full_name, token_hash, expires_at)
  values (:'email', 'admin', nullif(:'full_name', ''), :'token_hash', now() + interval '72 hours');
commit;
select 'ok';
\endif
SQL
)
case "$result" in
  ok)
    echo
    echo "Приглашение администратора для $EMAIL создано. Ссылка (действует 72 часа, открывается один раз):"
    echo
    echo "  $PUBLIC_URL/invite/$TOKEN"
    echo
    echo "Ссылка показана только здесь и больше нигде не сохранена. Передайте её администратору лично."
    ;;
  exists) echo "Пользователь $EMAIL уже есть. Если он не может войти — восстановление пароля на странице входа."; exit 1 ;;
  *) echo "ОШИБКА: приглашение не создано"; exit 1 ;;
esac
