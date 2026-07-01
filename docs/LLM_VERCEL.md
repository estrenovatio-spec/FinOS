# AI на Vercel (xinghuapi / OpenAI-совместимый API)

Приложение вызывает **`/v1/chat/completions`** — как в вашем Python-примере. Подходит [xinghuapi.com](https://xinghuapi.com) и любой OpenAI-совместимый прокси.

## Переменные в Vercel

**Settings → Environment Variables → Production** (и Preview при необходимости):

| Переменная | Значение | Обязательно |
|------------|----------|-------------|
| `LLM_API_KEY` | ваш `sk-...` с сайта API | Да* |
| `LLM_PROVIDER` | `xinghu` | Да** (вместо BASE_URL) |
| `LLM_BASE_URL` | `https://xinghuapi.com/v1` | Если не задан `LLM_PROVIDER` |
| `LLM_MODEL` | `gemini-2.5-pro-all` | Опционально (для xinghu подставится сам) |

\*\* Частая ошибка: только ключ в `OPENAI_API_KEY` **без** `LLM_BASE_URL` — запросы уходят на api.openai.com и падают → «AI недоступен». Задайте `LLM_PROVIDER=xinghu` или `LLM_BASE_URL`.

\* Вместо `LLM_API_KEY` можно задать `OPENAI_API_KEY` с тем же ключом.

Альтернативные имена (то же самое):

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

После добавления переменных: **Deployments → … → Redeploy**.

## Локально

```bash
cp .env.local.example .env.local
# вставьте LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
npm run dev
```

## Где используется

| Маршрут | Задача |
|---------|--------|
| `POST /api/parse-voice` | Разбор текста/голоса в транзакцию |
| `POST /api/recommendations` | AI-советы по бюджету (после 30 дней учёта) |

Голос в браузере распознаётся **без** этого API (Web Speech API). На сервер уходит уже текст.

## Если AI «молчит» или fallback

1. Проверьте ключ и URL на Vercel (без лишних пробелов).
2. Убедитесь, что модель `gemini-2.5-pro-all` доступна на вашем тарифе.
3. Если парсинг ломается, но чат в Python работает — добавьте `LLM_JSON_FORMAT=true`.
4. Если наоборот ошибка про `response_format` — оставьте без флага (по умолчанию для прокси JSON mode выключен).

Без ключа приложение не падает: работает простой парсер (сообщение «AI недоступен»).

## Безопасность

Ключ **только на сервере** (Vercel env), не в `NEXT_PUBLIC_*` и не в репозитории.
