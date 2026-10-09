# Платформа ИКР — план (этап 0)

Источники: `docs/Struktura_klientskoi_platformy.docx` (v2), `docs/Kontent_lendinga_po_blokam.docx` (v1),
текущий сайт в этом репозитории (Astro, тексты ИКР в `src/data/content.ts`).
Прототип кабинетов (claude.ai/artifact/G7T2RwkARiKDvBVzZsM84N) недоступен, `docs/client-portal-prototype.html` нет —
логику экранов беру из раздела 5–6 документа о структуре.

## Структура репозитория

Одно Next.js-приложение (App Router, TypeScript, Tailwind) заменяет текущий Astro-сайт в корне.
Дизайн-система, логотип, hero-видео и дословные тексты ИКР переносятся.

```
app/
  (site)/                    лендинг, /privacy, /consent, /thanks/*
  (auth)/                    /login, /invite/[token], /forgot, /reset
  cabinet/                   кабинет клиента (role = client)
  admin/                     кабинет команды (role = manager | admin)
  api/
    telegram/webhook/        Bot API webhook (секрет в заголовке)
    forms/lead|resume/       приём форм лендинга
    export/                  выгрузка Excel
middleware.ts                сессия, роль → разрешённые разделы, автовыход
lib/
  db/                        клиенты Supabase: server (RLS, от имени пользователя), admin (service role, только server-only)
  auth/                      вход с лимитом попыток, приглашения, роли
  email/                     интерфейс EmailProvider + console-провайдер (реальный подставим позже)
  telegram/                  отправка, inline-кнопки, разбор callback
  storage/                   интерфейс FileStorage (Supabase Storage → позже S3: Yandex Object Storage / Selectel)
  audit/                     запись в audit_log
  validation/                zod-схемы форм
components/  ui/  site/  cabinet/  admin/
content/                     тексты лендинга (из документа и текущего content.ts)
styles/tokens.css            цвета, шрифты, радиусы — в CSS-переменных, Tailwind читает их
supabase/
  migrations/*.sql           вся схема: enum-ы, таблицы, триггеры, представления, RLS, storage-политики
  seed.sql                   демо-данные
  tests/*.sql                pgTAP: изоляция ролей
tests/e2e/                   Playwright
docs/
```

## Принципы переносимости (переезд на сервер в РФ)

- RLS-политики не вызывают `auth.uid()` напрямую: обёртка `app.current_user_id()` читает
  `request.jwt.claims` (так работают Supabase и PostgREST; на «голом» PostgreSQL приложение ставит
  `set local` в транзакции). Роль и компания берутся из `profiles` через `security definer`-функции.
- Без `pg_net`, `pg_cron`, Edge Functions, Realtime-зависимой логики, Supabase Vault.
  Фоновые задачи (напоминания о гарантии) — route + внешний cron.
- `profiles.id` совпадает с id пользователя Auth, но жёсткой зависимости бизнес-схемы от `auth.*` нет,
  кроме одного FK, который при переезде заменяется.
- Файлы — через `lib/storage`, в базе хранится только ключ объекта; временные ссылки — signed URL.
- Supabase (Auth + PostgREST + Storage) можно развернуть у себя в Yandex Cloud / Selectel —
  это самый короткий путь переезда без переписывания.

## Решения по безопасности, которые закладываю

- **Приглашения — свои**, а не встроенные Supabase invite: срок ссылки в Supabase Auth ограничен
  общей настройкой OTP (не больше суток), а нужно 72 часа. В `invitations` хранится только хеш токена,
  ссылка одноразовая; пользователь создаётся сервером через admin API в момент установки пароля.
- **Вход только через серверный route**: он ведёт счётчик в `login_attempts` (по почте и по IP),
  блокирует на 15 минут после 5 ошибок, всегда отвечает одинаково, пишет вход в `audit_log`.
  Браузер не обращается к Supabase напрямую: все запросы идут через сервер Next.js, URL проекта и anon-ключ
  в клиентский бандл не попадают. Ограничение: в Supabase Cloud endpoint пароля Auth нельзя закрыть совсем,
  поэтому дополнительно включаем встроенный rate limit Auth; после переезда на свой сервер `/auth/v1/token`
  закрывается на прокси для всех, кроме сервера приложения.
- Открытая регистрация в Supabase Auth выключена (`enable_signup = false`).
- Service role ключ — только в `lib/db/admin.ts` с `import 'server-only'`.
- Клиент не имеет SELECT на `candidates`: данные кандидата отдаются через представление
  `client_candidates` (только кандидаты, предложенные по заявкам его компании, только разрешённые поля).
- Решения клиента — через функцию `client_decide(request_candidate_id, decision, reason)`:
  проверяет компанию, обязательность причины при отказе, пишет журнал. Прямого UPDATE клиент не имеет.
- Резюме и видео — в закрытом bucket, отдаются только signed URL на короткий срок.
- Отключение пользователя одним действием: `profiles.is_active = false` + бан в Auth + отзыв сессий.

## Модель данных (кратко)

Enum-ы: `user_role` (client, manager, admin), `candidate_stage` (offered, interested, interview, offer, hired, rejected),
`request_status` (new, search, offered, interview, closed, paused, cancelled), `source` (site, manager, bot).

Таблицы — как в задаче. Дополнения:
- `profiles.is_company_lead` — «руководитель клиента», может приглашать коллег.
- `requests.company_id` допускает NULL: заявка с сайта приходит до того, как компания создана;
  менеджер «принимает» её и привязывает к компании.
- `rejection_reasons`, `settings` (срок гарантии, автовыход) — справочники для админа.
- `login_attempts` — для лимита входа.
- Триггер на `request_candidates.stage` → `stage_history (from_stage, to_stage, changed_by, changed_at)`.
- Показатели — представления `v_company_metrics`, `v_request_funnel`, `v_rejection_reasons`,
  `v_admin_metrics` с `security_invoker = true`, чтобы RLS действовала и в них.

## Этапы

0. План (этот документ).
1. База и безопасность: миграции, RLS, представления, seed, pgTAP-тесты изоляции. Запуск — Supabase CLI в Docker.
2. Вход и приглашения.
3. Лендинг: 16 блоков, две формы, защита от спама.
4. Кабинет клиента.
5. Кабинет администратора.
6. Telegram-бот и почта.
7. Финал: чек-лист безопасности, e2e, README, перенос в РФ.

## Риски

- **152-ФЗ.** Supabase Cloud хранит данные вне РФ. До переезда в РФ в облаке можно держать только демо-данные;
  реальные резюме и контакты кандидатов — только после переезда (или сразу self-hosted в РФ).
- **Согласие кандидата.** Текущие документы не покрывают резюме, видео и передачу работодателям
  (раздел 5 документа о контенте) — нужен отдельный текст от юриста до запуска формы резюме.
- **Тексты.** Сайты ИКР.Ассистенты и «Домашний персонал» из этой среды недоступны, их текстов в репозитории нет.
