# Облачная синхронизация (household)

> **Пошаговая инструкция для пользователя:** [HOUSEHOLD_SETUP.md](./HOUSEHOLD_SETUP.md)


Реализован MVP: PostgreSQL + Prisma, авторизация через **Telegram initData** (Mini App) или **Login Widget** (браузер), семейный бюджет с метками `me` / `partner` на каждой операции.

## Режимы

| Режим | Кто | Как |
|--------|-----|-----|
| **Веду один** (`SOLO`) | Один Telegram-аккаунт | Создаёте облачный бюджет, указываете имя партнёра для меток. Второй человек не обязан подключаться. |
| **Вдвоём** (`SHARED`) | Два телефона | Создатель получает **код приглашения** (6 символов). Партнёр в настройках → «Присоединиться». После 2-го участника режим становится shared. |

Фильтры «Общий / Я / Партнёр» и отдельные балансы работают как в локальной версии.

## Переменные окружения (Vercel / `.env.local`)

```env
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=123456:ABC...   # тот же бот, что открывает Mini App
HOUSEHOLD_SESSION_SECRET=случайная_длинная_строка
```

Опционально:

```env
TELEGRAM_INIT_MAX_AGE_SEC=86400
```

Без `DATABASE_URL` API отвечает `503` — приложение продолжает работать только с `localStorage`.

## База данных

```bash
cd voicebudget
npm install
npx prisma db push   # или migrate deploy на проде
```

## API

| Метод | Путь | Описание |
|--------|------|----------|
| POST | `/api/household/bootstrap` | `{ initData }` → сессия + sync, если уже в семье |
| POST | `/api/household/create` | Создать семью (`mode`: `solo` \| `shared`, `partnerLabel`) |
| POST | `/api/household/join` | `{ inviteCode }` |
| GET | `/api/household/sync` | Bearer token → полный снимок |
| POST | `/api/household/import` | Залить локальные транзакции с телефона |
| POST/PATCH/DELETE | `/api/household/transactions` | CRUD операций |
| PATCH | `/api/household/partner-label` | Имя партнёра в облаке |

## Клиент

- Настройки → блок **«Облако и семья»**
- **Телефон:** откройте Mini App из бота — вход автоматический
- **Браузер:** https://voicebudget.vercel.app → **Войти через Telegram** (тот же аккаунт)
- При активном облаке: каждая операция уходит на сервер; при возврате на вкладку — **слияние** с облаком (локальные записи не затираются)
- После обновления приложения: новые системные категории подтягиваются с сервера; старый `food` → `Продукты`
- Сбой сети **не отключает** облако — сессия сбрасывается только при `401` / `403`
- **Синхронизировать** — принудительно обновить с облака (merge)
- **Загрузить данные с этого телефона** — однократный import из localStorage

Токен сессии: `voicebudget-cloud` в localStorage.

## Google Таблица (участники)

При **создании** семьи и **присоединении по коду** в таблицу пишутся имя, @ник, дата и id Telegram. Настройка: [GOOGLE-SHEETS.md](./GOOGLE-SHEETS.md), переменная `GOOGLE_SHEETS_WEBHOOK_URL` на Vercel.

## Дальше (не в MVP)

- Realtime (Supabase / polling)
- Офлайн-очередь
- Deep link `t.me/bot?startapp=join_CODE`
- Синхронизация пользовательских категорий при каждом изменении
