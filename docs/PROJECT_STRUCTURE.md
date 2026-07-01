# VoiceBudget — структура проекта

Обновлено: 2026-05-29. Прод: https://voicebudget.vercel.app

## Корень

| Путь | Назначение |
|------|------------|
| `src/` | Next.js 14 App Router, UI, API |
| `prisma/` | Схема БД + SQL-миграции вручную (`planning-tables.sql`, `subscription-tables.sql`) |
| `docs/` | FAQ, деплой, HELP_COPY, этот файл |
| `scripts/` | `deploy.sh`, `check-planning-tables.cjs` |
| `deploy` | Обёртка деплоя (Node из `.node/bin`) |
| `.env.local.example` | Шаблон секретов (не коммитить `.env.local`) |

## Главный экран (`src/app/page.tsx`)

1. `TMAHeader` — баланс (рамка, скрытие сумм, Я/партнёр)
2. `VoiceRecorder` — текст/голос
3. `TransactionList` — операции
4. `HomeSections` — фиксированный порядок:
   - `PlanningPanel` — цели, лимиты, подушка, регулярные
   - `FinancialChart` — статистика
   - `TipsPanel` — AI (недельный/месячный), мини-советы, планирование

Общие заголовки блоков: `HomeSectionCardHeader.tsx`

## Store (`src/store/`)

- `useStore.ts` — локальные данные, zustand + persist (v15)
- `useCloudStore.ts` — облако, подписка

## API (`src/app/api/`)

| Группа | Маршруты |
|--------|----------|
| Голос/ИИ | `parse-voice`, `transcribe`, `recommendations`, `weekly-analysis`, `monthly-analysis`, `monthly-chat`, `help-chat` |
| Облако | `household/*` (bootstrap, sync, goals, categories, …) |
| Telegram | `telegram/webhook`, `telegram/setup-webhook` |
| Платежи | `payments/yookassa/create`, `webhook` |
| Служебные | `status`, `llm-ping`, `stt-ping` |

## Ключевая логика (`src/lib/`)

- `planning/` — парсинг «закинул на отпуск», копилки, аналитика
- `household/` — синхронизация, JWT-сессии
- `cloud/` — bootstrap, merge sync
- `telegram/` — бот, initData
- `payments/` — YooKassa, подписка
- `i18n.ts` — все строки UI
- `format-date.ts` — даты DD-MM-YYYY в UI

## Деплой

```bash
cd voicebudget
bash deploy   # сборка + vercel --prod
```

Если Vercel привязан к GitHub (`estrenovatio-spec/voicebudget`), push в `main` тоже запускает деплой.

## БД (Supabase + Prisma)

При ошибке `P1017` — выполнить SQL из `prisma/*.sql` в Supabase SQL Editor.
