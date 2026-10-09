# Институт кадровых решений — платформа

Одно приложение: публичный сайт, кабинет клиента (вход по приглашению) и кабинет команды.
Next.js (App Router) + TypeScript + Tailwind, PostgreSQL через Supabase (Auth, Storage, RLS).

| Документ | О чём |
|---|---|
| `docs/PLAN.md` | структура и план по этапам |
| `docs/DB.md` | схема, роли, показатели, тесты изоляции, проверка на локальном Supabase |
| `docs/AUTH.md` | вход, приглашения, двойная проверка, автовыход, e2e |

```bash
npm install
npx supabase start && npx supabase db reset
cp .env.example .env.local   # ключи из `npx supabase status`
npm run dev                  # http://localhost:3000
```

| Команда | Что |
|---|---|
| `npm run build` / `npm start` | сборка и запуск |
| `npm run typecheck` | проверка типов |
| `npm test` | unit-тесты |
| `npm run db:test` | pgTAP на обычном PostgreSQL |
| `npx supabase test db` | pgTAP на локальном Supabase |
| `npm run e2e` | Playwright (см. `docs/AUTH.md`) |
| `npm run check:secrets` | ключей нет в браузерном бандле |

Прежний сайт на Astro лежит в `legacy/astro-site/` до переноса лендинга (этап 3): оттуда берутся
тексты ИКР, дизайн-токены, логотип и видео (`public/`).

Полный README (переменные окружения, деплой, перенос в Россию) — на этапе 7.
