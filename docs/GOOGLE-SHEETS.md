# Google Таблица — участники облака VoiceBudget

Когда пользователь **создаёт** семейный бюджет или **присоединяется по коду**, в таблицу добавляется строка: дата, имя, ник Telegram, id, действие.

Повторное «Создать» / «Присоединиться» с тем же аккаунтом (например, браузер после телефона) **не дублирует** строку.

---

## Заголовки листа «VoiceBudget»

```
дата | действие | имя | фамилия | telegram | telegram_user_id | режим | участников | код | id семьи | сайт
```

Лист создаётся скриптом автоматически.

---

## Apps Script

1. Создайте [Google Таблицу](https://sheets.google.com) или откройте существующую.
2. **Расширения → Apps Script** (скрипт привязан к этой таблице).
3. **Удалите старый код** в `Code.gs` и вставьте **целиком** файл [`google-apps-script-full.js`](./google-apps-script-full.js) из этого репозитория (семья + заявки ОСАГО/страхование/SG Capital в одном файле).

4. **Сохранить** → **Развернуть** → **Веб-приложение** → доступ **Все** → скопировать URL, оканчивающийся на `/exec`.

5. В Apps Script выберите `testVoiceBudgetMember` → ▶ — на листе **VoiceBudget** должна появиться тестовая строка.

### Заявки «Страхование и услуги» (лист **Заявки**)

Добавьте функцию **ниже** `appendVoiceBudgetMember` (не вставляйте фрагменты с `if (data.type` отдельно — иначе `ReferenceError: data is not defined`).

```javascript
function appendVoiceBudgetService(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Заявки");
  if (!sheet) {
    sheet = ss.insertSheet("Заявки");
    sheet.appendRow([
      "дата", "тема", "serviceId", "имя", "телефон", "telegram", "telegram_user_id", "сайт",
    ]);
  }
  sheet.appendRow([
    data.createdAt || new Date().toISOString(),
    data.serviceTopic || "",
    data.serviceId || "",
    data.fullName || "",
    data.phone || "",
    data.telegram || "",
    data.telegramUserId || "",
    data.siteUrl || "",
  ]);
  var row = sheet.getLastRow();
  if (data.highlightNew) {
    sheet.getRange(row, 1, row, 8).setBackground("#fff9c4");
  }
  SpreadsheetApp.flush();
}
```

В **`doPost`** переменная `data` появляется только после `JSON.parse`. Весь обработчик должен выглядеть так (подставьте свои ветки `wheel` / диагностика, если уже были):

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.type === "voicebudget_member") {
      appendVoiceBudgetMember(data);
    } else if (data.type === "voicebudget_service") {
      appendVoiceBudgetService(data);
    } else if (data.type === "wheel") {
      appendWheelRow(data); // ваша существующая функция колеса
    } else {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "unknown type" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

**Почему `data is not defined` на строке ~73:** в редактор вставили только кусок `if (data.type === "voicebudget_service") { ... }` **вне** `doPost`, или удалили строку `const data = JSON.parse(e.postData.contents);`.

**Проверка заявки из терминала:**

```bash
curl -sS -L -X POST "https://script.google.com/macros/s/ВАШ_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{"type":"voicebudget_service","highlightNew":true,"createdAt":"2026-06-04T12:00:00.000Z","serviceId":"osago","serviceTopic":"ОСАГО","fullName":"Тест","phone":"+79991234567","telegram":"@test","telegramUserId":123456789,"siteUrl":"https://voicebudget.vercel.app"}'
```

`serviceTopic`: «ОСАГО», «Антиклещ», «Ипотека / здоровье / недвижимость», «Страхование путешественников», «SG Capital — финансовый советник».

**Тест заявки ОСАГО с сервера (после деплоя):**

```bash
curl -sS -X POST "https://voicebudget.vercel.app/api/admin/test-google-sheets" \
  -H "Authorization: Bearer ВАШ_HOUSEHOLD_SESSION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"kind":"service","serviceId":"osago","firstName":"Тест","phone":"+79991234567"}'
```

Если в ответе `ok: true`, а строки в листе **Заявки** нет — в Apps Script нет ветки `voicebudget_service` или не сделано **Новая версия** развёртывания.

На Vercel для уведомлений в Telegram: `TELEGRAM_ADMIN_CHAT_ID` (ваш chat id) и `TELEGRAM_BOT_TOKEN` (бот Mini App). После правки скрипта: **Сохранить** → **Развернуть** → **Управление развёртываниями** → **Новая версия** (иначе URL `/exec` отдаёт старый код).

---

## Vercel

| Переменная | Значение |
|------------|----------|
| `GOOGLE_SHEETS_WEBHOOK_URL` | URL веб-приложения `/exec` |
| `NEXT_PUBLIC_SITE_URL` | `https://voicebudget.vercel.app` (опционально, для колонки «сайт») |

После добавления — **Redeploy**.

Локально: `voicebudget/.env.local`:

```env
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec
```

---

## Проверка из терминала

```bash
curl -sS -L -X POST "https://script.google.com/macros/s/ВАШ_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{"type":"voicebudget_member","createdAt":"2026-05-28T12:00:00.000Z","actionLabel":"Тест curl","firstName":"Маша","lastName":"","telegram":"@masha","telegramUserId":987654321,"mode":"Вдвоём","memberCount":2,"inviteCode":"XYZ789","householdId":"id-test","siteUrl":"https://voicebudget.vercel.app"}'
```

### Проверка через production API (без удаления пользователей)

Только **добавляет строку в таблицу**, базу не трогает.

**Bearer** — значение из Vercel → `HOUSEHOLD_SESSION_SECRET` (или `CLOUD_WIPE_SECRET`, если задан — подойдёт любой из админ-секретов).  
Это **не** GitHub-токен (`ghp_...`) и не пароль от Vercel.

```bash
# Тестовая строка (id 999999001, имя «Тест VoiceBudget»)
curl -sS -X POST "https://voicebudget.vercel.app/api/admin/test-google-sheets" \
  -H "Authorization: Bearer ВАШ_HOUSEHOLD_SESSION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

| Ответ | Значение |
|-------|----------|
| `{"error":"unauthorized"}` | Неверный Bearer (другой секрет, лишние пробелы, подставили `ghp_...`) |
| `{"ok":true,...}` | Авторизация ок, строка ушла в таблицу |
| `Google Sheets webhook HTTP 405` | Часто **старый код** на сервере повторял POST после редиректа Google (нужен `redirect: "follow"` в одном запросе). Или неверный URL — только `/exec`, не `/dev` и не ссылка на таблицу |

Догоняющая запись по уже существующему пользователю (данные из БД → строка в таблице):

```bash
curl -sS -X POST "https://voicebudget.vercel.app/api/admin/test-google-sheets" \
  -H "Authorization: Bearer ВАШ_HOUSEHOLD_SESSION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"telegramUserId":5118400621,"action":"create"}'
```

Локально (если в `.env.local` есть `GOOGLE_SHEETS_WEBHOOK_URL`):

```bash
node scripts/with-env-local.cjs node scripts/test-google-sheets.cjs
```

**Не удаляйте пользователей из БД для теста** — реальный первый вход проверяется только новым Telegram-аккаунтом или догоняющей записью выше.

---

## Когда пишется строка
|---------|-------------------|
| Первое открытие Mini App (новый Telegram-аккаунт в базе) | Открыл приложение |
| Первое создание облачного бюджета | Создал семью |
| Второй человек ввёл код приглашения | Присоединился |

Подключение браузера к уже существующей семье **не** создаёт новую строку.

---

## Почему новый человек не попал в таблицу

| Ситуация | Что происходит |
|----------|----------------|
| Сначала написал/наговорил **боту**, потом «Присоединиться» по коду | Бот создал **свою** соло-семью без строки в таблице; старый join не переключал семью — строка «Присоединился» не писалась. **Исправлено:** при другом коде старая семья снимается, join пишет в таблицу. |
| Удалил бота и зашёл снова | Аккаунт в базе остаётся — повторная строка «Открыл приложение» **не** дублируется (флаг `googleSheetsOpenLogged`). Нужно **Присоединиться** по коду или догоняющая запись (ниже). |
| Повторно «Создать» / тот же код | Строка не дублируется — это норма. |

**Проверка:** `GET https://voicebudget.vercel.app/api/status` → `googleSheetsConfigured: true`.

**Догнать строку вручную** (подставьте telegram id жены):

```bash
curl -sS -X POST "https://voicebudget.vercel.app/api/admin/test-google-sheets" \
  -H "Authorization: Bearer ВАШ_HOUSEHOLD_SESSION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"telegramUserId":123456789,"action":"join"}'
```

После обновления кода на Vercel один раз выполните в Supabase:

```sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleSheetsOpenLogged" BOOLEAN NOT NULL DEFAULT false;
```

(или `npm run db:push` локально с `DATABASE_URL`.)
