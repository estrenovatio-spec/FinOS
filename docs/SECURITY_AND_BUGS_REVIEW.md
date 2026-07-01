# Обзор безопасности и багов (2026-05-29)

Краткий аудит перед сном; не замена полноценного pentest.

## Критично — проверить на Vercel

| Риск | Где | Рекомендация |
|------|-----|--------------|
| Слабый секрет сессии по умолчанию | `src/lib/household/token.ts` — fallback `dev-household-secret-change-me` | Обязательно задать `HOUSEHOLD_SESSION_SECRET` (64+ случайных символов) в Production |
| Webhook Telegram без секрета | `TELEGRAM_WEBHOOK_SECRET` | Задать секрет; иначе возможны поддельные запросы к webhook |
| Пустые ключи в выгрузке env | Локально есть `.env.vercel.*` — в `.gitignore`, не пушить | Только Vercel Dashboard для прод-секретов |

## Средний приоритет

| Тема | Детали |
|------|--------|
| Данные в LLM | Help chat, разборы, parse-voice отправляют траты/сводки на внешний LLM — ожидаемо; не отправлять в публичные чаты |
| Подписка | `subscriptionEnforced()` — без YooKassa облако без paywall; с ключами — проверить `YOOKASSA_*` |
| Admin wipe | `/api/admin/wipe-cloud` — только с Bearer-секретом; не светить секрет |
| CORS / initData | Mini App: `requireTelegramUser` на API — убедиться, что все household routes защищены |

## Низкий / UX-баги

| Тема | Статус |
|------|--------|
| Скрытие баланса | Только UI + localStorage; в сетевых ответах суммы всё ещё есть при синхронизации |
| Кэш Telegram Mini App | После деплоя — полностью закрыть приложение |
| Планирование в БД | Таблицы goals/limits — ручной SQL если `prisma db push` падает с P1017 |
| Донат «Поддержка проекта» | Убран из UI; в `docs/TERMS_OF_SERVICE.md` ещё упоминание — косметика |

## Что сделано хорошо

- Zod на API-телах (help-chat, household)
- HMAC для household session, timing-safe compare
- Webhook YooKassa проверяет подпись (см. `yookassa.ts`)
- Секреты не в репозитории (`.gitignore` для `.env*.local`, `.env.vercel.*`)
- Сброс приложения чистит localStorage включая скрытие баланса

## Рекомендации на потом

1. Убрать dev-fallback секрета в production build (fail fast если нет `HOUSEHOLD_SESSION_SECRET`)
2. Rate limit на `/api/help-chat` и LLM-роуты
3. E2E-тест: «закинул на отпуск», возврат партнёру, скрытие баланса
