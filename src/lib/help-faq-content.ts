import { getTelegramBotMention, getTelegramBotName } from "@/lib/telegram/bot-name";
import type { Locale } from "@/types";

const BOT = getTelegramBotMention();

export type FaqSection = {
  id: string;
  title: Record<Locale, string>;
  /** Paragraphs; lines starting with "• " render as list items */
  body: Record<Locale, string[]>;
};

export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: "start",
    title: { ru: "С чего начать", en: "Getting started" },
    body: {
      ru: [
        `Откройте бота ${BOT} → «Открыть Mini App».`,
        "Запишите трату: текст + «Добавить» в приложении; рядом есть микрофон для голосового ввода.",
        "Вход только через Telegram — пароль не нужен.",
      ],
      en: [
        `Open ${BOT} → «Open Mini App».`,
        "Log an expense: text + «Add» in the app; voice — message the bot in Telegram.",
        "Sign-in is via Telegram only — no password.",
      ],
    },
  },
  {
    id: "commands",
    title: { ru: "Команды бота", en: "Bot commands" },
    body: {
      ru: [
        "/start — приветствие и зачем приложение.",
        "/help — шпаргалка: как записывать, копилки, облако вдвоём.",
        "/web — открыть вход для браузера/компьютера через тот же Telegram-аккаунт.",
        'Других команд нет. Любой текст без "/" — запись операции (как голосовое).',
      ],
      en: [
        "/start — welcome and what the app does for you.",
        "/help — quick guide: logging, jars, shared cloud.",
        "/web — open browser/desktop login for the same Telegram account.",
        "No other commands. Any text without / logs a transaction (like voice).",
      ],
    },
  },
  {
    id: "record",
    title: { ru: "Как записывать", en: "How to log" },
    body: {
      ru: [
        "В приложении: поле внизу + «Добавить».",
        "Голосом — нажмите микрофон рядом с полем ввода или отправьте голосовое боту в Telegram.",
        "Список — «Операции»: нажмите строку, чтобы изменить или удалить.",
      ],
      en: [
        "In the app: text field at the bottom + «Add» (text only).",
        "Voice — message the bot in Telegram (not in the Mini App).",
        "Transaction list on home — tap a row to edit or delete.",
      ],
    },
  },
  {
    id: "phrases",
    title: { ru: "Примеры фраз", en: "Phrase examples" },
    body: {
      ru: [
        "Расход: потратил 500 на обед · 1500 в пятёрочке",
        "Доход: зарплата 80000 · получил 5000 · своя категория — по ключевым словам (питер 20 тысяч)",
        "Партнёр: переключатель «Кто» или фраза — любимая потратила 500 · имя из настроек",
        "Копилка: отложил 5000 на отпуск · закинул 2000 в подушку · 5000 на отпуск (если копилка уже есть)",
        "Создать копилку: создать цель отпуск цель 150000",
        "Доход + копилка: зарплата 100000, 20000 на отпуск",
        "Несколько операций: 500 на обед и 200 на такси",
        "Суммы: 1,5 млн · сто тысяч. В фразе нужна цифра.",
        "Категория — по словам (пятёрочка → Продукты). Свои слова — Настройки → Категории.",
      ],
      en: [
        "Expense: spent 500 on lunch · 1500 at the store",
        "Income: salary 80000 · received 5000 · custom category — match your keywords",
        "Partner: «Who» toggle or phrase — partner spent 500 · name from settings",
        "Jar: saved 5000 for vacation · 5000 for vacation (if jar already exists)",
        "Create jar: create goal vacation target 150000",
        "Income + jar: salary 100000, 20000 for vacation",
        "Multiple: 500 lunch and 200 taxi",
        "Amounts: 1.5m · 100k. Include a number.",
        "Category from keywords. Custom — Settings → Categories.",
      ],
    },
  },
  {
    id: "balance",
    title: { ru: "Баланс и «в кармане»", en: "Balance & cash on hand" },
    body: {
      ru: [
        "В шапке главной — блок баланса. Нажмите на подпись или строку — суммы скроются (••••), ещё раз — покажутся.",
        "Нажмите на цифру (Общий / Я / партнёр) — окно «Реально в кармане»: укажите, сколько денег сейчас.",
        "Удобно, если по операциям одна сумма, а в кошельке другая — можно подогнать общий баланс или отдельно «я» и партнёра.",
      ],
      en: [
        "On the home header — balance block. Tap the label or row to hide amounts (••••), tap again to show.",
        "Tap a figure (All / Me / Partner) — «Cash on hand»: enter what you actually have now.",
        "Useful when transactions and real cash differ — adjust All, Me, or Partner separately.",
      ],
    },
  },
  {
    id: "partner",
    title: { ru: "Партнёр и семья", en: "Partner & household" },
    body: {
      ru: [
        "Без облака: имя партнёра в шапке (⚙) — метки «Я» / партнёр только на этом телефоне.",
        "В фразе: любимая потратила · милая моя 500 · имя из настроек.",
        "Облако «Веду один» — бэкап, один Telegram.",
        "«Вдвоём» — код 6 символов; второй: Настройки → Присоединиться.",
        "Фильтры Общий / Я / Партнёр — на главном экране.",
      ],
      en: [
        "Without cloud: set partner name in settings — «Me» / partner labels.",
        "Cloud «Solo» — server backup, one Telegram account.",
        "«Shared» — 6-character code; partner: Settings → Join.",
        "All / Me / Partner filters — on the home screen.",
      ],
    },
  },
  {
    id: "cloud",
    title: { ru: "Облако и синхронизация", en: "Cloud & sync" },
    body: {
      ru: [
        "Без облака данные только на этом устройстве.",
        "С облаком новые операции уходят автоматически.",
        "Синхронизация и восстановление из архива — в блоке «Облако и семья».",
        "Браузер: Войти через Telegram → Подключить этот браузер → обновить данные.",
        "Команда /web в боте тоже откроет вход для браузера/компьютера.",
        "Партнёр не видит траты — не присоединился по коду или открывает не из Telegram.",
      ],
      en: [
        "Without cloud, data stays on this device only.",
        "With cloud, new entries sync automatically.",
        "Sync and archive restore — in «Cloud & family».",
        "Browser: Log in via Telegram → Attach browser → refresh data.",
        "Bot command /web also opens browser/desktop login.",
        "Partner missing expenses — not joined by code or not using Telegram.",
      ],
    },
  },
  {
    id: "subscription",
    title: { ru: "Подписка", en: "Subscription" },
    body: {
      ru: [
        "При включённой оплате: облако + голосовой бот требуют активную подписку.",
        "Локальные данные на телефоне не удаляются при паузе.",
        "Оплата в настройках (Облако) → «Я оплатил — обновить».",
        "Точная цена и срок — в приложении (500 ₽ / 30 дн.).",
      ],
      en: [
        "When billing is on: cloud + voice bot need an active subscription.",
        "Local data on the phone is not deleted when paused.",
        "Pay in settings (Cloud) → «I paid — refresh».",
        "Exact price and period — shown in the app (often ~299 ₽ / 30 days).",
      ],
    },
  },
  {
    id: "planning",
    title: { ru: "Цели и планирование", en: "Goals & planning" },
    body: {
      ru: [
        "Семья → «Цели и планы»: Копилки · Лимиты · Подушка · Регулярные · Долги.",
        "В копилку — нужна сумма и слово «на/в/для» + название цели, либо глагол:",
        "отложил · закинул · положил · в копилку · накопил · кинул в копилку.",
        "Примеры: отложил 5000 на отпуск · 5000 на отпуск (копилка «Отпуск» уже есть).",
        "Доход сразу в копилку: зарплата 100000, 20000 на отпуск.",
        "Новая цель: создать цель машина цель 500000.",
      ],
      en: [
        "Home → «Goals & planning»: Jars · Limits · Emergency · Recurring.",
        "To a jar — amount + for/to + goal name, or a verb: saved · deposited · put aside.",
        "Examples: saved 5000 for vacation · 5000 for vacation (jar exists).",
        "Income split: salary 100000, 20000 for vacation.",
        "New goal: create goal car target 500000.",
      ],
    },
  },
  {
    id: "ai",
    title: { ru: "Рост и финсоветник", en: "Growth & advisor" },
    body: {
      ru: [
        "Вкладка «Рост»: миссия недели, «Финсоветник заметил», разборы 7/30 дней.",
        "Миссия недели — маленькое действие для финансовой привычки, а не просто совет.",
        "«Финансовая память» живёт в настройках: там можно посмотреть и удалить то, что приложение выучило.",
        "Если ИИ недоступен, операции всё равно записываются.",
      ],
      en: [
        "Mini tips, weekly/monthly analysis, report chat — «Tips & AI» block.",
        "AI gives general budgeting hints, not tax or investment advice.",
        "If AI is down, logging still works.",
      ],
    },
  },
  {
    id: "troubleshoot",
    title: { ru: "Не работает?", en: "Troubleshooting" },
    body: {
      ru: [
        "Не нашёл сумму — добавьте цифру: 500 обед.",
        "Пусто в браузере — войти через Telegram, скачать с облака.",
        "Зависло — «Сбросить кэш и перезагрузить» в настройках (если есть).",
        "Оплата не применилась — «Я оплатил — обновить», перезапустить Mini App.",
      ],
      en: [
        "Voice: allow mic · HTTPS · voice to bot · type manually.",
        "Amount not found — include a number: 500 lunch.",
        "Empty browser — log in via Telegram, download from cloud.",
        "Frozen — reset cache & reload in settings (if shown).",
        "Payment not applied — «I paid — refresh», restart Mini App.",
      ],
    },
  },
  {
    id: "privacy",
    title: { ru: "Данные и очистка", en: "Data & reset" },
    body: {
      ru: [
        "Локально — данные не на сервере. В облаке — привязка к Telegram ID.",
        "«Очистить данные» — очищает это устройство и ставит автосинхронизацию на паузу.",
        "Облачная копия остаётся. Восстановление — Настройки → Облако и семья → архив/загрузка из облака.",
      ],
      en: [
        "Local mode — no server. Cloud — tied to your Telegram ID.",
        "«Clear data» — this device only; cloud copy remains.",
        "You can download from cloud again after clearing.",
      ],
    },
  },
];

const FAQ_KEYWORDS: Record<string, RegExp> = {
  start: /начать|перв|запуск|старт|start|begin/i,
  commands: /команд|бот|\/start|\/help|slash/i,
  record: /запис|добав|внест|ввод|трат|расход|log|add|enter/i,
  phrases: /фраз|пример|сказать|написать|phrase|example/i,
  partner: /партн|жен|муж|вдво|семь|код|приглас|wife|husband|partner|invite/i,
  cloud: /облак|синхрон|бэкап|браузер|скачать|отправить|cloud|sync|backup/i,
  subscription: /подписк|оплат|500|плат|subscription|pay/i,
  planning: /копилк|цел|лимит|подушк|регуляр|planning|goal|jar|limit/i,
  ai: /совет|разбор|ai|анализ|чат.*отчет/i,
  troubleshoot: /не работ|ошиб|не вид|завис|пусто|не нашел|broken|error|missing/i,
  privacy: /удал|очист|данн|сброс|clear|delete|wipe/i,
};

/** Только релевантные разделы FAQ — меньше шума для модели */
export function buildRelevantFaqText(question: string, locale: Locale): string {
  const q = question.toLowerCase().replace(/ё/g, "е");
  const scored = FAQ_SECTIONS.map((section) => {
    const re = FAQ_KEYWORDS[section.id];
    const hits = re ? (re.test(q) ? 2 : 0) : 0;
    return { section, score: hits };
  });
  scored.sort((a, b) => b.score - a.score);

  const withHits = scored.filter((s) => s.score > 0).map((s) => s.section);
  const base = FAQ_SECTIONS.filter((s) => ["start", "record", "cloud", "partner"].includes(s.id));
  const picked = withHits.length >= 2 ? withHits : [...base, ...withHits];
  const unique = Array.from(new Map(picked.map((s) => [s.id, s])).values()).slice(0, 6);

  return unique
    .map((s) => {
      const title = s.title[locale];
      const lines = s.body[locale].map((l) => (l.startsWith("• ") ? l : `• ${l}`)).join("\n");
      return `## ${title}\n${lines}`;
    })
    .join("\n\n");
}

/** Все разделы FAQ (legacy) */
export function buildFaqKnowledgeText(locale: Locale): string {
  return FAQ_SECTIONS.map((s) => {
    const title = s.title[locale];
    const lines = s.body[locale].map((l) => (l.startsWith("• ") ? l : `• ${l}`)).join("\n");
    return `## ${title}\n${lines}`;
  }).join("\n\n");
}

export type FaqCheatsheetSection = {
  title: Record<Locale, string>;
  steps: Record<Locale, string[]>;
  example?: Record<Locale, string>;
};

export const FAQ_CHEATSHEET_SECTIONS: FaqCheatsheetSection[] = [
  {
    title: { ru: "Запись операций", en: "Logging transactions" },
    steps: {
      ru: [
        "На главной внизу — поле ввода. Напишите фразу и нажмите «Добавить».",
        "Голосом — нажмите микрофон рядом с полем ввода или отправьте голосовое боту в Telegram.",
      ],
      en: [
        "On the home screen — text field at the bottom. Type a phrase and tap «Add».",
        "Voice — tap the microphone near the input field or send a voice message to the bot.",
      ],
    },
    example: {
      ru: "потратил 500 на обед · зарплата 80 000",
      en: "spent 500 on lunch · salary 80000",
    },
  },
  {
    title: { ru: "Категории", en: "Categories" },
    steps: {
      ru: [
        "Категория подбирается по словам во фразе (пятёрочка → Продукты, такси → Транспорт).",
        "Свои категории и ключевые слова: ⚙ → Категории.",
        "Свой доход — добавьте ключевое слово в доходную категорию; дальше достаточно назвать его во фразе.",
      ],
      en: [
        "Category is picked from words in your phrase (store → Groceries, taxi → Transport).",
        "Custom categories and keywords: ⚙ → Categories.",
        "Custom income — add a keyword to an income category, then use it in a phrase.",
      ],
    },
    example: { ru: "питер 20 тысяч", en: "client name 5000" },
  },
  {
    title: { ru: "Партнёр", en: "Partner" },
    steps: {
      ru: [
        "⚙ в шапке — имя партнёра. Появятся метки «Я» / партнёр (только на этом телефоне).",
        "В фразе можно не переключать «Кто» — скажите «любимая потратила», «милая моя 500» или имя из настроек.",
        "Вдвоём с общим бюджетом — см. блок «Облако» ниже.",
      ],
      en: [
        "⚙ in the header — partner name. «Me» / partner labels appear (this device only).",
        "In a phrase: «partner spent 500» or the name from settings — no need to toggle «Who».",
        "Shared household budget — see «Cloud» below.",
      ],
    },
    example: { ru: "любимая потратила 800 на продукты", en: "Alex spent 800 on groceries" },
  },
  {
    title: { ru: "Цели и планы", en: "Goals & plans" },
    steps: {
      ru: [
        "Семья → «Цели и планы»: Копилки, Лимиты, Подушка, Регулярные, Долги.",
        "Создать копилку: «создать копилку отпуск цель 150000» · «создать цель отпуск 150000».",
        "По желанию — срок «до 01.07.2026»: приложение само посчитает, сколько откладывать в месяц (цель ÷ месяцев до срока).",
        "Пополнить — сумма + «на/в/для» + название: «отложил 5000 на отпуск», «закинул в подушку 2000».",
        "Если копилка уже есть — достаточно коротко: «5000 на отпуск».",
        "Часть зарплаты сразу в цель: две суммы через запятую.",
      ],
      en: [
        "Create: home → Goals & planning → Jars, or «create goal vacation target 150000».",
        "Optional deadline «by 2026-07-01» and plan «10000 per month» (also in the app form).",
        "Deposit — amount + for/to + name: «saved 5000 for vacation».",
        "If the jar exists — short form works: «5000 for vacation».",
        "Split salary to a jar: two amounts separated by a comma.",
      ],
    },
    example: {
      ru: "зарплата 100 000, 20 000 на отпуск",
      en: "salary 100000, 20000 for vacation",
    },
  },
  {
    title: { ru: "Несколько операций", en: "Multiple at once" },
    steps: {
      ru: ["В одной фразе через «и» — каждая часть со своей суммой."],
      en: ["One phrase with «and» — each part with its own amount."],
    },
    example: { ru: "500 на обед и 200 на такси", en: "500 lunch and 200 taxi" },
  },
  {
    title: { ru: "Баланс в шапке", en: "Balance (header)" },
    steps: {
      ru: [
        "Нажмите на блок баланса — суммы скроются (••••), нажмите снова — покажутся.",
        "Нажмите на сумму (Общий, «Я» или партнёр) — «Реально в кармане»: введите, сколько денег сейчас.",
        "Если в кошельке не совпадает с суммой по операциям — подгоните общий или отдельно «я» / партнёр.",
      ],
      en: [
        "Tap the balance block — amounts hide (••••), tap again to show.",
        "Tap an amount (All, Me, or Partner) — «Cash on hand»: enter what you actually have.",
        "If cash differs from transaction totals — adjust All, Me, or Partner separately.",
      ],
    },
  },
  {
    title: { ru: "Облако вдвоём", en: "Shared cloud" },
    steps: {
      ru: [
        "⚙ → Облако и семья → «Вдвоём» → «Создать облачный бюджет» → скопируйте код.",
        "Второй человек: ⚙ → Присоединиться → ввести код.",
        "Для входа с компьютера или браузера отправьте боту /web — он даст ссылку на тот же Telegram-аккаунт.",
        "Операции синхронизируются; фильтры Общий / Я / Партнёр — на главной.",
      ],
      en: [
        "⚙ → Cloud & family → Shared → create cloud budget → copy invite code.",
        "Second person: ⚙ → Join → enter code.",
        "For browser/desktop login, send /web to the bot — it returns a link for the same Telegram account.",
        "Transactions sync; filters All / Me / Partner — on home screen.",
      ],
    },
  },
  {
    title: { ru: "Бизнес", en: "Business" },
    steps: {
      ru: [
        "Вкладка «Бизнес»: общий баланс бизнеса, валюты, быстрый ввод, показатели выбранного бизнеса.",
        "Быстрый ввод — доход/расход бизнеса: «получил 15000 за консультацию», «3000 реклама».",
        "Внутри бизнеса: Операции, Резерв, Налог, Долги, «Проекты и источники».",
        "«Проекты и источники» — клиенты, разовые проекты, активы, аренда. Для клиента достаточно названия; сумма необязательна.",
      ],
      en: [
        "Business tab: business balance, rates, quick input, selected business metrics.",
        "Inside a business: Operations, Reserve, Tax, Debts, Projects & sources.",
        "Projects & sources: clients, one-off projects, assets, rentals. Client amount is optional.",
      ],
    },
    example: { ru: "получил 15000 за консультацию", en: "received 15000 for consultation" },
  },
  {
    title: { ru: "Рост", en: "Growth" },
    steps: {
      ru: [
        "«Рост» — миссия недели, «Финсоветник заметил» и разборы 7/30 дней.",
        "Миссия недели учит одной финансовой привычке через маленькое действие.",
        "«Финансовая память» находится в настройках и показывает, какие слова приложение запомнило.",
      ],
      en: [
        "Growth: weekly mission, advisor notes, 7/30-day reviews.",
        "Weekly mission builds one money habit through a small action.",
        "Financial memory shows phrases and corrections the app learned.",
      ],
    },
  },
];

export function faqCheatsheetSections(locale: Locale): {
  title: string;
  steps: string[];
  example?: string;
}[] {
  return FAQ_CHEATSHEET_SECTIONS.map((s) => ({
    title: s.title[locale],
    steps: s.steps[locale],
    example: s.example?.[locale],
  }));
}

/** Ежемесячные взносы, сложный процент ~15% годовых, 10 лет (упрощённо). */
/** HTML для Telegram /start — приветствие и ценность приложения */
export function formatBotStartHtml(locale: Locale, botUsername = getTelegramBotName()): string {
  const bot = botUsername.replace(/^@/, "");

  if (locale === "en") {
    return (
      `<b>Budget — track spending and income</b>\n\n` +
      `Say or type what you spent or received. The app picks a category and updates your balance.\n\n` +
      `Examples:\n` +
      `• spent 500 on lunch\n` +
      `• got 6000 salary\n` +
      `• wife bought groceries 2000\n\n` +
      `You can share a budget with your partner — one cloud for both.\n\n` +
      `Tap the button below to open the app, or send a message here.\n\n` +
      `🎤 Tap the microphone at the bottom and say what you spent.\n\n` +
      `Cheatsheet: /help\n\n` +
      `@${bot}`
    );
  }

  return (
    `<b>Бюджет — ваши траты и доходы</b>\n\n` +
    `Пишите или говорите, как потратили или получили деньги. Приложение само разложит по категориям и посчитает баланс.\n\n` +
    `Примеры:\n` +
    `• потратил 500 на обед\n` +
    `• получил 6000 зарплата\n` +
    `• жена купила продукты 2000\n\n` +
    `Можно вести бюджет вдвоём — вы и партнёр в одном облаке.\n\n` +
    `Откройте приложение кнопкой ниже или напишите операцию прямо сюда.\n\n` +
    `🎤 Внизу жмите на микрофон и скажите, на что потратили.\n\n` +
    `Шпаргалка: /help\n\n` +
    `@${bot}`
  );
}

function formatCheatsheetBlock(locale: Locale): string {
  const exampleLabel = locale === "ru" ? "Пример" : "Example";
  return faqCheatsheetSections(locale)
    .map((section) => {
      const steps = section.steps.map((s) => `• ${s}`).join("\n");
      const ex = section.example
        ? `\n<i>${exampleLabel}:</i> «${section.example}»`
        : "";
      return `<b>${section.title}</b>\n${steps}${ex}`;
    })
    .join("\n\n");
}

/** HTML для Telegram /help — шпаргалка из приложения (до ~3500 символов) */
export function formatBotHelpHtml(locale: Locale, botUsername = getTelegramBotName()): string {
  const bot = botUsername.replace(/^@/, "");
  const sheet = formatCheatsheetBlock(locale);

  if (locale === "en") {
    return (
      `<b>Quick guide</b>\n\n` +
      `${sheet}\n\n` +
      `<b>Bot</b>\n` +
      `Any text without / = log a transaction · voice works too.\n` +
      `/start — welcome\n` +
      `/web — browser/desktop login\n` +
      `More: Mini App → Settings → Help → ask AI\n\n` +
      `@${bot}`
    );
  }

  return (
    `<b>Шпаргалка</b>\n\n` +
    `${sheet}\n\n` +
    `<b>Бот</b>\n` +
    `Любой текст без / = запись операции · можно голосом.\n` +
    `/start — приветствие\n` +
    `/web — вход с компьютера или браузера\n` +
    `Подробнее: Mini App → Настройки → Помощь → спросите ИИ\n\n` +
    `@${bot}`
  );
}
