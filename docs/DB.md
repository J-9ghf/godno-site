# База данных и доступы (этап 1)

Вся схема — SQL-миграции в `supabase/migrations`. Руками в панели Supabase схему не меняем.

| Файл | Что внутри |
|---|---|
| `…0100_core.sql` | enum-ы, таблицы, справочники (позиции, причины отказа, настройки) |
| `…0200_access.sql` | функции текущего пользователя, RLS-политики трёх ролей, права |
| `…0300_pipeline.sql` | история этапов, правила смены этапов, `client_decide()`, журнал, блокировка входа |
| `…0400_metrics.sql` | представления показателей и `client_candidates` |
| `…0500_storage.sql` | закрытые бакеты для резюме, видео, документов |
| `supabase/seed.sql` | демо-данные (вымышленные) |
| `supabase/tests/*.sql` | pgTAP-тесты изоляции и расчётов |

## Запуск тестов

Нужен PostgreSQL 15+ с `pgtap` и `pg_prove` (Ubuntu: `apt install postgresql-16-pgtap`).

```bash
DB_ADMIN_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run db:test
```

Скрипт пересоздаёт базу `ikr_test`, ставит эмуляцию Supabase (`scripts/db/supabase-shim.sql`:
роли `anon`/`authenticated`/`service_role`, таблицы `auth.users` и `storage.*`), применяет миграции,
демо-данные и запускает тесты (сейчас 145). С Supabase CLI то же самое: `supabase db reset && supabase test db`.

## Демо-пользователи

| Роль | Почта | Компания |
|---|---|---|
| admin | admin@example.com | — |
| manager | manager1@example.com | Альфа |
| manager | manager2@example.com | Бета |
| client, руководитель | alfa.lead@example.com | Альфа |
| client | alfa.hr@example.com | Альфа |
| client, руководитель | beta.lead@example.com | Бета |

Пароль у всех демо-пользователей: `IkrDemo-2026!`. Админ входит с кодом из письма (см. `docs/AUTH.md`).

## Кто что видит

| | client | manager | admin |
|---|---|---|---|
| companies | своя | назначенные | все |
| requests | своей компании | назначенных компаний + входящие без компании + назначенные лично | все |
| candidates (пул) | **нет** | все | все |
| request_candidates, stage_history, interviews | своей компании | назначенных | все |
| client_candidates (кандидат без контактов) | своей компании | — | — |
| documents, messages, service_requests | своей компании | назначенных | все |
| profiles | себя, своего менеджера; руководитель — коллег | команду и клиентов назначенных компаний | все |
| invitations | руководитель — своей компании, только рядовых коллег | — | все |
| audit_log, nps | — | — | чтение |
| settings, справочники | чтение | чтение | изменение |

Ключевые правила, которые проверяют тесты:
- Клиент не имеет политики на `candidates` вообще. Кандидата он видит только через `client_candidates`:
  строки ограничены компанией клиента, телефона, почты, Telegram, путей к файлам и заметок там нет.
- Решения «Интересен», «Интервью», «Отказ» клиент принимает только через `client_decide()`.
  Отказ без причины не принимается. Команда не может записать решение клиента или поставить «Интересен».
- Отключённый пользователь (`is_active = false`) сразу перестаёт видеть всё: роль вычисляется только для активных.
- Журнал и историю этапов нельзя изменить или удалить никому, включая админа. Пишут их триггеры и функции базы.
- Аноним не имеет прав ни на одну таблицу: формы сайта пишет сервер.

## Показатели

«Дошёл до этапа X» = в истории этапов есть переход на X или дальше. Кандидат, получивший отказ после
интервью, остаётся в «дошли до интервью». Иначе отказ задним числом уменьшал бы конверсию прошлых шагов.

| Представление | Что даёт |
|---|---|
| `v_request_candidate_progress` | для каждого кандидата в заявке: текущий и максимальный этап, дата предложения и выхода |
| `v_request_metrics` | по заявке: воронка, «ждут решения», время до первого кандидата, срок закрытия, дни в работе, гарантия |
| `v_company_metrics` | по компании: заявок в работе и закрыто, воронка, все конверсии в %, средние сроки |
| `v_rejection_reasons`, `v_request_rejection_reasons` | причины отказов по компании и по заявке |

Статус заявки следует за воронкой: первое предложение → «Кандидаты предложены», интервью или оффер →
«Интервью», выход сотрудника → «Закрыта» (начинается гарантия, срок в `settings.guarantee_days`).
Приостановленные и отменённые заявки автоматически не меняются.

## Переносимость

- Политики не используют `auth.uid()`: текущий пользователь берётся из `request.jwt.claims`
  (`app.current_user_id()`). На обычном PostgreSQL сервер выставляет это значение сам.
- Нет `pg_net`, `pg_cron`, Edge Functions, Vault. Единственная связь с Supabase — внешний ключ
  `profiles.id → auth.users.id` и вставка бакетов в `storage.buckets`.
- Действия сервера под `service_role` подписываются автором через `set local app.actor_id = '<uuid>'`.

## Как проверить локально (настоящий Supabase в Docker)

Проверено 9 октября 2026: Supabase CLI 2.120.0, образ `supabase/postgres:15.8.1.085`.
Результат: миграции и демо-данные применились, `supabase test db` → все тесты проходят (145 после этапа 2).

```bash
npm install                       # ставит Supabase CLI локально (devDependency)
npx supabase start                # поднимает Postgres, Auth, REST, Storage; заодно проверяет config.toml
npx supabase db reset             # пересоздаёт базу: миграции + supabase/seed.sql
npx supabase test db              # pgTAP-тесты из supabase/tests
npx supabase stop                 # остановить
```

- `supabase start` разбирает `supabase/config.toml` и падает при ошибке в нём, поэтому
  успешный старт и есть проверка конфигурации.
- Лишние сервисы можно не поднимать:
  `npx supabase start -x studio,imgproxy,vector,logflare,edge-runtime,realtime,supavisor,postgres-meta`.
- Если порт 54321/54322 занят, поменяйте `[api] port` и `[db] port` в `config.toml` локально и не коммитьте.
- Если Docker Hub отвечает 429 или ECR недоступен: `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start`.

Что отличалось от эмуляции:
- **`[auth.email] enable_signup = false` выключает вход по почте целиком** («Email logins are disabled»).
  Регистрацию закрывает только `[auth] enable_signup = false`, а `[auth.email] enable_signup` должен быть `true`.
  Эмуляция Auth не содержит, поэтому найти это можно было только на настоящем Supabase. Исправлено.
- Сервис Auth не читает пользователей, у которых служебные строковые поля (`confirmation_token` и т. п.)
  равны NULL. Это известная особенность GoTrue. Поэтому `seed.sql` заполняет их `''` (эмуляция дополнена
  этими полями); вход демо-пользователей на настоящем Supabase проверен.
- Схема базы и RLS вели себя одинаково. Важное отличие среды: в Supabase
миграции выполняет роль `postgres` без прав суперпользователя. Тесты прошли и в этом режиме,
значит, правила не опираются на права суперпользователя.

### Облачный проект: что выставить руками

Миграции не управляют настройками Auth в облаке. В панели проекта:
- **Authentication → Sign In / Providers → Allow new users to sign up: выключить.**
  Аккаунты создаёт только сервер по приглашению.
- **Authentication → Sign In / Providers → Email:** Minimum password length = 10; Confirm email: выключить
  (почту подтверждает переход по ссылке-приглашению).
- **Authentication → Rate Limits:** Sign-ups and sign-ins — не больше 30 за 5 минут с одного IP;
  Token refreshes — по умолчанию.
- **Authentication → Sessions:** Access token expiry (JWT) = 1800 секунд.
- **Authentication → URL Configuration:** Site URL = адрес приложения.
- Демо-данные в облако: `psql "$SUPABASE_DB_URL" -f supabase/seed.sql` (один раз, только в демо-проект).
