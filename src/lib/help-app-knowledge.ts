import { getTelegramBotMention } from "@/lib/telegram/bot-name";
import type { Locale } from "@/types";

const BOT = getTelegramBotMention();

/** Карта экранов и кнопок — точные названия как в приложении */
export function buildAppScreenMap(locale: Locale): string {
  if (locale === "en") {
      return `APP UI MAP (exact labels):
- Home tab: balance (tap block to hide amounts; tap a figure for «Cash on hand»), quick expense entry, microphone, transaction list
- Summary tab: Goals & plans
- Advisor tab: weekly/monthly review, AI chats, memory
- Biz tab: business balance, currencies, quick input, selected business metrics, advisor notes, Operations, Reserve, Tax, Debts, Projects & sources
- More tab: Services, Cloud, Help, Settings
- Settings (gear): Help, Categories, Cloud & family, partner name/keywords, app update, clear data
- Cloud & family: Solo / Shared, create cloud budget, invite code, Join, sync controls, archive restore`;
  }
  return `КАРТА ПРИЛОЖЕНИЯ (точные названия кнопок):
- Вкладка «Дом»: баланс (нажать на блок — скрыть суммы; нажать на цифру — «Реально в кармане»), быстрая запись траты, микрофон, список операций
- Вкладка «Цели и планы»: цели, планы
- Вкладка «Финсоветник»: недельный и месячный разбор, AI-чаты, память
- Вкладка «Биз»: баланс бизнеса, валюты, быстрый ввод, показатели выбранного бизнеса, «Финсоветник заметил», Операции, Резерв, Налог, Долги, «Проекты и источники»
- Вкладка «Ещё»: Услуги, Облако, Помощь, Настройки
- Настройки (шестерёнка): «Помощь и вопросы», «Категории», «Облако и семья», имена/ключевые слова партнёра, обновление приложения, «Очистить данные»
- «Облако и семья»: «Веду один» / «Вдвоём», создание облачного бюджета, код приглашения, «Присоединиться», синхронизация, восстановление из архива
- Бот ${BOT}: голосовое или текст = запись; /start — приветствие, /help — шпаргалка, /web — вход с компьютера/браузера`;
}

type Playbook = {
  id: string;
  keywords: RegExp;
  title: Record<Locale, string>;
  steps: Record<Locale, string[]>;
};

const PLAYBOOKS: Playbook[] = [
  {
    id: "add_expense",
    keywords:
      /трат|расход|запис|добав|внест|потрат|купил|оплатил|списал|expense|spent|log|add/i,
    title: { ru: "Записать трату", en: "Log an expense" },
    steps: {
      ru: [
        "Откройте Mini App (бот → «Открыть приложение»).",
        "На главной внизу поле ввода — напишите, например: «потратил 500 на обед».",
        "Нажмите «Добавить» — операция появится в списке на вкладке «Дом».",
        "Можно нажать микрофон рядом с полем ввода и сказать фразу голосом.",
        `Или отправьте текст/голосовое боту ${BOT}.`,
      ],
      en: [
        "Open Mini App (bot → Open app).",
        "On home, type e.g. «spent 500 on lunch» and tap Add.",
        "Or send voice/text to the bot.",
      ],
    },
  },
  {
    id: "partner_shared",
    keywords:
      /партн|жен|муж|вдво|вместе|семь|код|приглас|подключ|двоих|shared|partner|wife|husband|invite|join/i,
    title: { ru: "Вести бюджет вдвоём", en: "Shared budget with partner" },
    steps: {
      ru: [
        "Оба должны открывать приложение из Telegram (не просто сайт без входа).",
        "Тот, кто создаёт: Настройки → «Облако и семья» → «Вдвоём» → «Создать облачный бюджет» — появится код из 6 символов.",
        "Второй: тот же бот → Настройки → ввести код → «Присоединиться».",
        "Если траты не видны — проверьте синхронизацию или восстановление из архива.",
        "Без облака можно только метки «Я»/партнёр: укажите имя партнёра в настройках, но телефоны не синхронизируются.",
      ],
      en: [
        "Both use Telegram Mini App.",
        "Creator: Settings → Cloud & family → Shared → Create cloud budget → share 6-char code.",
        "Partner: Settings → enter code → Join → Sync.",
      ],
    },
  },
  {
    id: "cloud_solo",
    keywords: /облак|бэкап|сохран|сервер|синхрон|браузер|cloud|backup|sync/i,
    title: { ru: "Облако и бэкап", en: "Cloud backup" },
    steps: {
      ru: [
        "Настройки → «Облако и семья» → «Веду один» → «Создать облачный бюджет».",
        "Новые операции уходят в облако сами.",
        "Если нужно вернуть данные: Настройки → «Облако и семья» → восстановление из архива.",
        "На компьютере: сайт → Настройки → «Войти через Telegram» → «Подключить этот браузер».",
        `Если не получается найти вход: отправьте боту ${BOT} команду /web — он даст ссылку для браузера.`,
        "Нужна активная подписка, если на сервере включена оплата.",
      ],
      en: [
        "Settings → Cloud & family → Solo → Create cloud budget.",
        "Browser: Log in via Telegram → Attach browser → refresh data.",
      ],
    },
  },
  {
    id: "subscription",
    keywords: /подписк|оплат|500|купил доступ|плат|subscription|pay|paid/i,
    title: { ru: "Подписка", en: "Subscription" },
    steps: {
      ru: [
        "Подписка даёт облако + голосового бота (если оплата включена на сервере).",
        "Настройки → блок облака / оплата → «Оплатить» → после оплаты «Я оплатил — обновить».",
        "Данные на телефоне при паузе подписки не удаляются.",
        "Цена в приложении (сейчас ориентир 500 ₽ / 30 дней).",
      ],
      en: [
        "Settings → pay → I paid — refresh.",
        "Local data is kept if subscription pauses.",
      ],
    },
  },
  {
    id: "balance_money",
    keywords:
      /баланс|сколько|остал|денег|свобод|доход|расход за|потратил за|how much|balance|spent this/i,
    title: { ru: "Сколько денег / баланс", en: "Balance & totals" },
    steps: {
      ru: [
        "На главной сверху — «Баланс» (доходы минус расходы с учётом фильтра).",
        "Фильтры: Общий / Я / имя партнёра — переключают, чьи операции считать.",
        "«Статистика» и сводки ниже — разбивка по категориям за период.",
        "Если спрашивают «сколько на еду» — назовите сумму из данных пользователя ниже, не придумывайте.",
      ],
      en: [
        "Home screen shows Balance; use All / Me / Partner filters.",
        "Use finance JSON for exact numbers.",
      ],
    },
  },
  {
    id: "balance",
    keywords:
      /баланс|карман|скрыт|спрят|подогн|реально|сумм|•••|balance|hide|cash|adjust/i,
    title: { ru: "Баланс и «в кармане»", en: "Balance & cash on hand" },
    steps: {
      ru: [
        "В шапке главной — блок баланса. Нажмите на подпись или строку — суммы скроются (••••), ещё раз — покажутся.",
        "Нажмите на цифру (Общий / Я / партнёр) — «Реально в кармане»: сколько денег сейчас.",
        "Можно подогнать общий баланс или отдельно «я» и партнёра, если в кошельке не совпадает с операциями.",
      ],
      en: [
        "Home header — balance block. Tap label or row to hide amounts (••••), tap again to show.",
        "Tap a figure (All / Me / Partner) — «Cash on hand».",
        "Adjust All, Me, or Partner if real cash differs from transaction totals.",
      ],
    },
  },
  {
    id: "categories",
    keywords: /категор|продукт|пятёр|магазин|categor/i,
    title: { ru: "Категории", en: "Categories" },
    steps: {
      ru: [
        "Категория — по ключевым словам (пятёрочка → Продукты).",
        "Свои категории доходов/расходов: Настройки → Категории → ключевые слова.",
        "Своя доходная категория срабатывает по словам во фразе (например «питер 20 тысяч»).",
        "Изменить у записи: нажать операцию в списке → редактирование.",
      ],
      en: ["Settings → Categories. Tap transaction to edit category."],
    },
  },
  {
    id: "goals",
    keywords: /копилк|цел|отлож|подушк|накоп|goal|jar|savings/i,
    title: { ru: "Копилки и цели", en: "Savings goals" },
    steps: {
      ru: [
        "Семья → «Цели и планы» → «Копилки».",
        "Фразой: «отложил 5000 на отпуск» · «закинул в подушку 2000».",
        "Если копилка уже создана — достаточно «5000 на отпуск» (без «отложил»).",
        "Часть зарплаты в цель: «зарплата 100000, 20000 на отпуск».",
        "Новая цель: «создать цель отпуск цель 150000 до 01.07.2026» — взнос в месяц посчитается сам.",
      ],
      en: [
        "Home → Planning → Jars tab.",
        "Say: «saved 5000 for vacation» · «5000 for vacation» if jar exists.",
        "Split income: «salary 100000, 20000 for vacation».",
        "New goal: «create goal vacation target 150000».",
      ],
    },
  },
  {
    id: "not_syncing",
    keywords:
      /не вид|не появ|пропал|не синхрон|два бюджет|разные|пусто|empty|not see|missing/i,
    title: { ru: "Не видно операций / не синхронизируется", en: "Missing transactions" },
    steps: {
      ru: [
        "Проверьте, что оба в одной семье (код «Присоединиться»).",
        "Оба открывают из Telegram, не только браузер без входа.",
        "Проверьте синхронизацию или восстановление из архива.",
        "Если подписка неактивна — облако и бот могут быть на паузе.",
      ],
      en: ["Same household code, both in Telegram, refresh data."],
    },
  },
];

/** Готовый ответ без LLM — если API упал или модель молчит */
export function formatBuiltinHelpAnswer(question: string, locale: Locale): string | null {
  const q = question.toLowerCase().replace(/ё/g, "е");
  const matched = PLAYBOOKS.filter((p) => p.keywords.test(q));
  if (matched.length === 0) return null;

  const p = matched[0];
  const steps = p.steps[locale].map((s, i) => `${i + 1}. ${s}`).join("\n");
  const intro =
    locale === "ru"
      ? `«${p.title.ru}» — по шагам:\n\n${steps}`
      : `${p.title.en} — step by step:\n\n${steps}`;
  return intro;
}

export function selectPlaybooksForQuestion(question: string, locale: Locale, limit = 4): string {
  const q = question.toLowerCase().replace(/ё/g, "е");
  const matched = PLAYBOOKS.filter((p) => p.keywords.test(q));
  const picked = matched.length > 0 ? matched.slice(0, limit) : PLAYBOOKS.slice(0, 2);

  return picked
    .map((p) => {
      const steps = p.steps[locale].map((s, i) => `${i + 1}. ${s}`).join("\n");
      return `### ${p.title[locale]}\n${steps}`;
    })
    .join("\n\n");
}

const FEW_SHOT_RU = `ПРИМЕРЫ (как отвечать на размытые вопросы):

Вопрос: «как жене подключить»
Ответ: Чтобы вести один бюджет на двух телефонах: 1) Вы в Настройках → Облако и семья → Вдвоём → Создать облачный бюджет — скопируйте код. 2) Жена открывает того же бота в Telegram → Настройки → вводит код → Присоединиться. 3) Если траты не видны — Синхронизировать. Без облака общий список на двух телефонах не получится.

Вопрос: «куда писать трату»
Ответ: На главном экране внизу — поле и кнопка «Добавить». Напишите «потратил 300 кофе» или отправьте так же боту. Операция появится в списке выше.

Вопрос: «оплатил ничего не работает»
Ответ: После оплаты: Настройки → «Я оплатил — обновить», подождите минуту, полностью закройте и снова откройте Mini App. Если облако было выключено — подписка нужна для синхронизации и бота.

Вопрос: «сколько на еду ушло»
Ответ: (если есть данные) Смотрите цифры из сводки по категориям; если записей мало — добавьте несколько трат с словами «продукты», «магазин».`;

const FEW_SHOT_EN = `EXAMPLES (vague questions):

Q: "how to connect wife"
A: Settings → Cloud & family → Shared → Create → share code → she Joins in her Telegram app.

Q: "where to enter expense"
A: Home → type amount and description → Add.`;

export function buildFewShotExamples(locale: Locale): string {
  return locale === "ru" ? FEW_SHOT_RU : FEW_SHOT_EN;
}

export type HelpQuestionKind = "app" | "finance" | "mixed";

export function classifyHelpQuestion(question: string): HelpQuestionKind {
  const q = question.toLowerCase().replace(/ё/g, "е");
  const finance =
    /сколько|потрат|расход|доход|баланс|категор|месяц|недел|средн|больше всего|тренд|остал|денег|руб|₽|цел.*накоп|how much|spent|income|balance|category/i.test(
      q,
    );
  const app =
    /как|где|что нажать|не работ|не вид|подключ|облак|бот|настро|кнопк|приложен|код|приглас|оплат|подписк|категор|копилк|удал|очист|синхрон|how do|where|button|cloud|settings|help/i.test(
      q,
    );
  if (finance && app) return "mixed";
  if (finance) return "finance";
  return "app";
}
