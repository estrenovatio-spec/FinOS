# Как выложить VoiceBudget на Vercel (пошагово для новичка)

Публичная ссылка будет вида: `https://ваш-проект.vercel.app`

---

## Что понадобится

1. Аккаунт **GitHub** (бесплатно) — [github.com](https://github.com)
2. Аккаунт **Vercel** (бесплатно) — [vercel.com](https://vercel.com)
3. Ключ **OpenAI** — [platform.openai.com](https://platform.openai.com) → API keys
4. Папка проекта: `voicebudget` (у вас уже есть)

---

## Шаг 1. Проверка, что проект собирается

В терминале:

```bash
cd "/Users/bhima/Downloads/апп/voicebudget"
npm install
npm run build
```

Если в конце нет ошибок — можно выкладывать на Vercel.

---

## Шаг 2. Git — «сохранить версию» проекта

Vercel удобнее всего подключается к **GitHub**.

**Важно:** email в коммите должен совпадать с аккаунтом GitHub (или noreply GitHub). Иначе деплой будет **Blocked**. В терминале один раз в папке проекта:

```bash
git config user.email "ВАШ_ID+ВАШ_ЛОГИН@users.noreply.github.com"
git config user.name "ваш-логин-github"
```

Noreply-адрес: GitHub → Settings → Emails → «Keep my email addresses private» (формат `id+login@users.noreply.github.com`).

```bash
cd "/Users/bhima/Downloads/апп/voicebudget"
git init
git add .
git commit -m "VoiceBudget: готово к деплою на Vercel"
```

Файл `.env.local` **не попадёт** в Git (это правильно — секреты только на Vercel).

---

## Шаг 3. Репозиторий на GitHub

1. Зайдите на [github.com](https://github.com) → **New repository**
2. Имя, например: `voicebudget`
3. **Public** или Private — на ваш выбор
4. **Не** ставьте галочки README / .gitignore (у вас уже есть код)
5. **Create repository**

GitHub покажет команды. Выполните (подставьте свой логин):

```bash
cd "/Users/bhima/Downloads/апп/voicebudget"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/voicebudget.git
git push -u origin main
```

При первом `push` браузер может попросить войти в GitHub.

---

## Шаг 4. Проект на Vercel

1. [vercel.com](https://vercel.com) → **Sign Up** → войти через **GitHub**
2. **Add New…** → **Project**
3. Найдите репозиторий `voicebudget` → **Import**

### Настройки импорта

| Поле | Значение |
|------|----------|
| Framework Preset | Next.js (обычно сам) |
| Root Directory | оставьте `.` если репозиторий = только папка voicebudget |
| Build Command | `npm run build` |
| Install Command | `npm install` |

Если весь репозиторий — одна папка `voicebudget` внутри другого репо, укажите Root Directory: `voicebudget`.

---

## Шаг 5. Переменные окружения (секреты)

Перед **Deploy** откройте **Environment Variables** и добавьте:

| Имя | Значение | Обязательно |
|-----|----------|-------------|
| `LLM_API_KEY` | `sk-...` (xinghu / OpenAI) | Да (разбор фраз и AI-советы) |
| `LLM_BASE_URL` | `https://xinghuapi.com/v1` | Да, если не официальный OpenAI |
| `LLM_MODEL` | `gemini-2.5-pro-all` | Рекомендуется для xinghu |
| `OPENAI_API_KEY` | то же, что `LLM_API_KEY` | Альтернативное имя |
| `ADVISOR_NAME` | Ваше имя для советов | Рекомендуется |
| `ADVISOR_CONTACT` | `https://t.me/ваш_ник` | Рекомендуется |
| `NEXT_PUBLIC_TG_BOT_NAME` | имя бота без @ | Если используете Telegram |

Для всех переменных выберите окружения: **Production**, **Preview**, **Development**.

Нажмите **Deploy** и подождите 2–5 минут.

---

## Шаг 6. Публичная ссылка

После успешного деплоя:

- Vercel покажет **Visit** → ссылка вида `https://voicebudget-xxxx.vercel.app`
- Эту ссылку можно открыть в любом браузере
- В **Settings → Domains** можно подключить свой домен (позже)

---

## Шаг 7. Подключение Telegram Mini App

Сначала дождитесь **успешного деплоя** на Vercel и скопируйте URL (только **https://**, без слэша в конце).

Пример: `https://voicebudget-abc123.vercel.app`

### Вариант A — кнопка меню у бота (проще всего)

1. Откройте [@BotFather](https://t.me/BotFather)
2. Команда `/mybots` → выберите бота
3. **Bot Settings** → **Menu Button** → **Configure menu button**
4. Текст кнопки, например: `Открыть бюджет`
5. Тип: **Web App** → вставьте URL с Vercel
6. Сохраните

### Вариант B — отдельное Mini App

1. В BotFather: `/newapp` (или **Edit Apps** у существующего бота)
2. Выберите бота, название, описание
3. **Web App URL** → URL с Vercel
4. BotFather даст ссылку вида `https://t.me/YourBot/app` — её можно дать клиентам

### Проверка

1. Откройте бота в Telegram (телефон или Desktop)
2. Нажмите кнопку меню / «Открыть приложение»
3. Должен открыться VoiceBudget (баланс, кнопка добавления)

### Если в Telegram белый экран

- На Vercel: **Deployments** → **Redeploy** (без кэша)
- В браузере на том же URL сайт должен открываться
- Убедитесь, что в Vercel задан `LLM_API_KEY` (или `OPENAI_API_KEY`) и при прокси — `LLM_BASE_URL`

Голос в Telegram иногда ограничен — можно вводить сумму **текстом** в поле внизу.

---

## Обновление сайта после правок

Рекомендуется из папки проекта:

```bash
cd "/Users/bhima/Downloads/апп/voicebudget"
npm run deploy
```

Или через Git: `git push` — Vercel пересоберёт за 1–3 минуты.

### Что **не ломает** обычный деплой кода

- Запись трат, баланс, категории на телефоне (localStorage)
- Mini App из Telegram
- База Supabase (семьи, операции в облаке)

### Что **сбрасывает облако** у всех пользователей

| Действие | Эффект |
|----------|--------|
| Смена `HOUSEHOLD_SESSION_SECRET` на Vercel | Старые токены облака недействительны → нужно снова открыть Mini App из бота (облако подтянется само) |
| «Отключить облако» в настройках | Локально пауза, данные на телефоне остаются |
| Очистка данных приложения / «Очистить данные» | Всё локальное пропадает |

**Не меняйте** `HOUSEHOLD_SESSION_SECRET` без необходимости. Для curl-тестов Google Таблицы можно завести отдельный `CLOUD_WIPE_SECRET` и не трогать session secret.

После деплоя: полностью закройте Mini App → откройте из бота. Если облако «слетело» — **Настройки → Облако** → «Создать» / «Присоединиться» по коду или «Подключить браузер» (на сайте).

---

## Если что-то не работает

| Проблема | Что сделать |
|----------|-------------|
| Build failed на Vercel | Откройте **Deployments** → последний деплой → **Building** → прочитайте красную ошибку |
| Голос/AI не отвечает | Проверьте `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` → **Redeploy**. См. [LLM_VERCEL.md](./LLM_VERCEL.md) |
| Белый экран | Deployments → **⋯** → **Redeploy** → снять галочку **Use existing Build Cache** |
| Ошибка загрузки в браузере | Очистить Local Storage ключ `voicebudget-store` |
| Облако «отключено» после деплоя | Закрыть Mini App, открыть из бота; не менять `HOUSEHOLD_SESSION_SECRET` без нужды |

---

## Деплой без GitHub (через терминал)

Для опытных:

```bash
npm i -g vercel
cd "/Users/bhima/Downloads/апп/voicebudget"
vercel login
vercel
```

Следуйте вопросам в терминале. Переменные окружения потом в [vercel.com](https://vercel.com) → проект → Settings → Environment Variables.
