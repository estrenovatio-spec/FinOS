# Просто Бюджет — Telegram Mini App MVP

Голосовой учёт финансов в Telegram WebView.

## Локальный запуск

```bash
cd voicebudget
npm install
cp .env.local.example .env.local
npm run dev
```

Если белый экран или 404 на JS:

```bash
npm run dev:clean
```

Откройте [http://localhost:3000](http://localhost:3000) и сделайте **Cmd+Shift+R**.

## Деплой на Vercel (публичная ссылка)

Подробная инструкция для новичка: **[docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md)**

Кратко: GitHub → Import на [vercel.com](https://vercel.com) → переменные `OPENAI_API_KEY`, `ADVISOR_NAME`, `ADVISOR_CONTACT` → Deploy → URL в BotFather.

## FAQ для пользователей

[docs/FAQ.md](docs/FAQ.md) — как пользоваться **Бюджетом**, команды бота, облако, подписка, типичные проблемы.

## Облачная синхронизация

См. [docs/CLOUD_SYNC.md](docs/CLOUD_SYNC.md) и [docs/HOUSEHOLD_SETUP.md](docs/HOUSEHOLD_SETUP.md).

## Тест AI-рекомендаций

1. `.env.local`: `OPENAI_API_KEY`, `ADVISOR_NAME`, `ADVISOR_CONTACT`
2. `NEXT_PUBLIC_AI_RECOMMENDATIONS_MIN_DAYS=1` для быстрого теста
3. Добавьте транзакции → блок «Рекомендации» → кнопка ↻

Промпт: `src/lib/ai-recommendations.ts`
