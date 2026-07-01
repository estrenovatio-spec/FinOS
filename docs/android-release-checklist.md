# Android release checklist: Просто Бюджет

## 1. Что уже готово в веб-приложении

- Прод-адрес: `https://voicebudget.vercel.app`
- Название для Android/Google Play: `Просто Бюджет: учёт финансов`
- Package name: `app.prostobudget.android`
- PWA manifest: `https://voicebudget.vercel.app/manifest.webmanifest`
- Иконки: `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/maskable-512.png`
- Синхронизация: через текущий сервер/Vercel/Supabase
- Telegram: тот же бот `@Fin_BU_Bot`, тот же домен `voicebudget.vercel.app`

## 2. Что нужно поставить на Mac

1. Установить Android Studio: https://developer.android.com/studio
2. Открыть Android Studio.
3. В установщике выбрать:
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device
   - Android SDK Build-Tools
4. После установки открыть Android Studio -> Settings -> Languages & Frameworks -> Android SDK.
5. Проверить, что установлен Android SDK и актуальная SDK Platform.
6. Установить JDK 17, если Android Studio сам его не поставил.

Проверка в терминале:

```bash
java -version
ls "$HOME/Library/Android/sdk"
```

## 3. Создать Android TWA-проект

После установки Java/Android SDK:

```bash
cd /Users/bhima/Downloads/апп/voicebudget
export PATH="$PWD/.node/bin:$PATH"
npx --cache .npm-cache --yes @bubblewrap/cli init \
  --manifest=https://voicebudget.vercel.app/manifest.webmanifest \
  --directory=android/prosto-budget
```

Ответы в Bubblewrap:

- Application ID / Package name: `app.prostobudget.android`
- App name: `Просто Бюджет`
- Launcher name: `Просто Бюджет`
- Host: `voicebudget.vercel.app`
- Start URL: `/?source=pwa`
- Display mode: `standalone`
- Orientation: `portrait`
- Theme color: `#047857`
- Background color: `#ffffff`

## 4. Сборка AAB

```bash
cd /Users/bhima/Downloads/апп/voicebudget/android/prosto-budget
npx --cache ../../.npm-cache --yes @bubblewrap/cli build
```

На выходе нужен `.aab` для Google Play.

## 5. Digital Asset Links

После генерации Android-проекта Bubblewrap даст SHA-256 отпечаток ключа.

Нужно создать файл:

```text
public/.well-known/assetlinks.json
```

В нём будет связь:

- сайт: `https://voicebudget.vercel.app`
- package: `app.prostobudget.android`
- SHA-256 ключа подписи

Без этого Android может открыть приложение не как полноценный TWA, а как браузерную вкладку.

## 6. Google Play Console

1. Зайти: https://play.google.com/console
2. Создать личный аккаунт разработчика.
3. Оплатить регистрацию.
4. Пройти верификацию личности.
5. Создать приложение:
   - Name: `Просто Бюджет: учёт финансов`
   - Default language: Russian
   - App or game: App
   - Free or paid: Free
   - Category: Finance
6. Заполнить App content:
   - Privacy policy
   - Data safety
   - Target audience
   - Ads: No, если рекламы нет
   - Financial features: указать учёт финансов/бюджета, без банковских операций

## 7. Closed testing

Для нового личного аккаунта Google Play обычно требует закрытое тестирование:

- минимум 12 тестировщиков;
- тест должен идти 14 дней;
- тестировщики должны принять приглашение и пользоваться приложением.

После этого можно запросить Production access.

## 8. Telegram и синхронизация

В Android-приложении открывается тот же сайт и тот же сервер.

Что проверить:

1. В BotFather для `@Fin_BU_Bot` домен должен быть `voicebudget.vercel.app`.
2. В Mini App остаётся Telegram `initData`.
3. В Android-приложении вне Telegram пользователь должен входить через Telegram Login/бота.
4. После входа должны подтянуться:
   - семейные операции;
   - бизнесы;
   - проекты;
   - отчёты;
   - подписка/рефералка.

## 9. Что проверить перед публикацией

- Вход через Telegram.
- Добавление операции.
- Голосовой ввод.
- Синхронизация после перезапуска приложения.
- Бизнес-вкладка.
- Excel/PDF отчёты.
- Оплата/подписка, если включаем.
- Deep link на бота.
- Иконка и название на телефоне.
