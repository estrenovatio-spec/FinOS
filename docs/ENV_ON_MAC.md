# Как сохранить `.env.local` на Mac (если «не сохраняется»)

## Проверка: сохранилось ли на самом деле

В Терминале:

```bash
cd "/Users/bhima/Downloads/апп/voicebudget"
npm run env:check
```

Если видите `✅ Файл .env.local есть на диске` — файл **сохранён**. Проблема тогда не в сохранении, а в подключении к Supabase (см. ниже).

---

## Способ 1 — Cursor (редактор)

1. Откройте папку **`voicebudget`**, не всю папку `апп`.
2. В дереве файлов найдите **`.env.local`** (точка в начале имени важна).
3. **Не** редактируйте `.env.local.example` — это только образец.
4. После правки нажмите **⌘ + S** (Save).
5. На вкладке не должно остаться **белой точки** (несохранённый файл).

Если `.env.local` не видно: **View → Show Hidden Files** или создайте файл через Терминал (способ 2).

---

## Способ 2 — Терминал (надёжнее для новичков)

```bash
cd "/Users/bhima/Downloads/апп/voicebudget"
nano .env.local
```

- Стрелками найдите строку `DATABASE_URL=`
- Вставьте строку из Supabase после `=`
- **Control + O** → Enter (сохранить)
- **Control + X** (выйти)

Проверка:

```bash
npm run env:check
```

---

## Способ 3 — TextEdit

```bash
cd "/Users/bhima/Downloads/апп/voicebudget"
open -a TextEdit .env.local
```

Вставьте `DATABASE_URL=...` → **Файл → Сохранить** (⌘S).

---

## Если файл сохранён, но `npm run db:push` пишет Can't reach database

1. Supabase → проект не **Paused** (не приостановлен).
2. В `.env.local` попробуйте не Direct, а **Session pooler** (в Supabase: Connection string → Session pooler, порт **5432**, хост `*.pooler.supabase.com`).
3. Снова: `npm run db:push`

На **Vercel** всё равно нужен **Transaction pooler** (порт **6543**) + `?pgbouncer=true`.
