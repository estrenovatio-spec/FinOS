import {
  type CategoryDefinition,
  detectCategoryId,
  detectTypeFromCategories,
  detectTypeFromVerbs,
  formatCategoryCatalogForPrompt,
  getDefaultCategories,
  getFallbackCategoryId,
  normalizeParsedCategory,
  refineParsedTransaction,
  sanitizeCategories,
} from "@/lib/categories";
import { APP_CURRENCY } from "@/lib/app-currency";
import { matchAiMemoryType } from "@/lib/ai-memory";
import { looksLikeGoalDeposit } from "@/lib/planning/parse-input";
import {
  parseAmountFromTranscript,
  resolveTransactionAmount,
} from "@/lib/parse-amount";
import {
  extractCompactMultiAmountInput,
  extractSeparatedMoneyAmounts,
} from "@/lib/multiple-amounts";
import { isGarbageTranscript } from "@/lib/transcript-guard";
import { ownerHintsForPrompt } from "@/lib/detect-owner";
import { sanitizeTransactionNote } from "@/lib/transaction-note";
import type { Locale, ParsedTransaction, TxType } from "@/types";

export const PARSE_PROMPT = (
  transcript: string,
  locale: Locale,
  categories: CategoryDefinition[] = getDefaultCategories(),
  partnerName?: string | null,
  myName?: string | null,
  partnerKeywords?: readonly string[],
) => {
  const merged = sanitizeCategories(categories);
  const expenseCatalog = formatCategoryCatalogForPrompt(
    merged,
    "expense",
    locale,
  );
  const incomeCatalog = formatCategoryCatalogForPrompt(
    merged,
    "income",
    locale,
  );
  const ownerHints = ownerHintsForPrompt(
    locale,
    partnerName,
    myName,
    partnerKeywords,
  );
  const ownerBlock = ownerHints
    ? `\n## Кто совершил (для note, не в JSON)\n${ownerHints}\n- «возврат» / refund → type income, categoryId refund.\n`
    : "";

  if (locale === "ru") {
    return `Ты — точный разборщик семейного бюджета. Из фразы пользователя извлеки одну или несколько финансовых операций.

## Фраза
"${transcript}"

## Ответ
Только валидный JSON, без markdown и комментариев:
{
  "transactions": [
    {
      "amount": number,
      "type": "income" | "expense",
      "categoryId": string,
      "currency": "RUB",
      "note": string,
      "date": "YYYY-MM-DD"
    }
  ]
}

## Категории расходов (categoryId строго из списка)
${expenseCatalog}

## Категории доходов (categoryId строго из списка)
${incomeCatalog}

## Правила categoryId
- Сопоставляй фразу со строкой «слова:» и названием категории. При совпадении keyword — выбирай эту categoryId.
- Категории [своя категория] пользователя важнее общих: если слово из фразы есть в их keywords — бери их id.
- Не ставь other / income_other / expense fallback, если подходит более узкая категория из каталога.
- Примеры узких совпадений: фестиваль, ретрит, аквапарк, кино → entertainment; обед/ужин/кафе/ресторан → dining_out; ремонт, мебель → housing; такси, бензин, метро → transport.

## Доход vs расход
- «потратил», «купил», «оплатил», «отдал», «заплатил» → expense.
- «получил», «пришло», «зачислили», «зарплата», «перевели мне», «перевели 6000» (без «в копилку») → income.
- Если в фразе есть **слова партнёра из настроек** (см. блок «Кто совершил») — это его/её доход или расход, не пользователя.
- «отложил», «в копилку», «накопил», «перевёл в копилку» — это НЕ твоя задача (другой модуль); не придумывай expense goal_jar для «пришло/перевели».
- Субаренда, арендный доход, сдача квартиры → income, не rent expense.

## Суммы (рубли)
- «100 тысяч» / «100 тыс» = 100000; «1.5 млн» = 1500000.
- «100.000» в речи про рубли = 100000 (точка — разделитель тысяч, не 100 рублей).
- currency всегда "RUB". Сумму в note не дублируй.

## Несколько операций
- «500 на обед и 200 на такси» → 2 объекта; у каждого своя сумма, categoryId и короткий note (только эта часть, не вся фраза).
- «83 83 жена метро» → 2 объекта по 83 ₽, оба partner/жена и transport/метро; не склеивай в 8383.
- Если подряд идут несколько одинаковых или разных чисел через пробел/запятую, а после них общее описание («метро», «продукты», «жена») — это несколько операций с одинаковым описанием.
- Одна операция → массив из одного элемента.

## Поле note
- 3–80 символов: на что потратили/откуда пришло (магазин, услуга, источник).
- Без суммы и без слов «руб», «₽». Пример: «Пятёрочка, продукты на неделю», «Зарплата за март».

## Прочее
- date: сегодня ${new Date().toISOString().slice(0, 10)}, если в фразе нет другой даты.
- Нет суммы → amount 0. Тип неясен → expense.
${ownerBlock}`;
  }

  return `You parse household budget phrases into structured transactions.

## User phrase
"${transcript}"

## Output
Valid JSON only (no markdown):
{
  "transactions": [
    {
      "amount": number,
      "type": "income" | "expense",
      "categoryId": string,
      "currency": "RUB",
      "note": string,
      "date": "YYYY-MM-DD"
    }
  ]
}

## Expense categories (categoryId must match exactly)
${expenseCatalog}

## Income categories (categoryId must match exactly)
${incomeCatalog}

## categoryId rules
- Match phrase against each line's keywords and label.
- Prefer [user category] when a user keyword matches.
- Avoid generic "other" when a specific id fits (festival → entertainment, lunch → dining_out, etc.).

## income vs expense
- spent / bought / paid → expense.
- received / salary / credited / "transferred to me" → income (NOT savings jar).
- rent/sublease income → income, not rent expense.

## amounts
- Russian: "100 тыс" = 100000; "1.5 млн" = 1500000; "100.000" rubles = 100000.
- currency always "RUB". Do not repeat amount in note.

## Multiple items
- Split "500 lunch and 200 taxi" into 2 transactions with separate notes.

## note field
- Short human-readable purpose (3–80 chars), no currency amount in note.
- date: ${new Date().toISOString().slice(0, 10)} unless phrase has another date.
${ownerBlock}`;
};

const INCOME_KEYWORDS_RU = [
  "получил",
  "получила",
  "получили",
  "зарплата",
  "аванс",
  "фриланс",
  "доход",
  "пришло",
  "пришли",
  "зачислили",
  "зачисление",
  "поступило",
  "поступили",
  "возврат",
  "вернули",
  "вернула",
  "компенсация",
  "кэшбэк",
  "кешбэк",
  "субаренда",
  "субаренду",
  "субаренде",
  "арендный доход",
  "сдача квартиры",
  "сдаю квартиру",
  "сдали квартиру",
  "получил за аренду",
  "поступило за аренду",
  "пришла арендная плата",
  "поступила арендная плата",
  "аренда пришла",
  "клиент оплатил",
  "оплатил клиент",
  "заказчик оплатил",
];
const INCOME_KEYWORDS_EN = [
  "received",
  "salary",
  "income",
  "earned",
  "got paid",
];
const EXPENSE_KEYWORDS_RU = [
  "потратил",
  "купил",
  "оплатил",
  "отдал",
  "отдала",
  "заплатил",
  "расход",
  "потратила",
];
const EXPENSE_KEYWORDS_EN = ["spent", "bought", "paid", "expense"];

export function detectType(
  transcript: string,
  locale: Locale,
  categories?: CategoryDefinition[],
): TxType {
  const fromVerbs = detectTypeFromVerbs(transcript, locale);
  if (fromVerbs) return fromVerbs;
  if (categories?.length) {
    const fromMemory = matchAiMemoryType(
      transcript,
      sanitizeCategories(categories),
    );
    if (fromMemory) return fromMemory;
    const fromCats = detectTypeFromCategories(transcript, categories);
    if (fromCats) return fromCats;
  }
  const lower = transcript.toLowerCase();
  const incomeKw = locale === "ru" ? INCOME_KEYWORDS_RU : INCOME_KEYWORDS_EN;
  const expenseKw = locale === "ru" ? EXPENSE_KEYWORDS_RU : EXPENSE_KEYWORDS_EN;
  const isIncome = incomeKw.some((w) => lower.includes(w));
  const isExpense = expenseKw.some((w) => lower.includes(w));
  return isIncome && !isExpense ? "income" : "expense";
}

export function splitTranscriptClauses(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const splitRe =
    /\s*(?:[\n\r]+|[;,])\s*|\s+и\s+|\s+ещё?\s+|\s+потом\s+|\s+также\s+|\s+а\s+(?=потрат|куп|оплат|получ|заплат)|(?<=(?:на\s+[\p{L}\d-]+))\s+(?=\d[\d\s.,]*\s*(?:руб|₽|рубл(?:ей|я|ь)?))/iu;

  const parts = trimmed
    .split(splitRe)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 1 ? parts : [trimmed];
}

export function fallbackParse(
  transcript: string,
  locale: Locale,
  categories: CategoryDefinition[] = getDefaultCategories(),
): ParsedTransaction {
  if (isGarbageTranscript(transcript)) {
    return {
      amount: 0,
      type: "expense",
      categoryId: getFallbackCategoryId("expense"),
      currency: APP_CURRENCY,
      note: "",
      date: new Date().toISOString().slice(0, 10),
    };
  }

  const type = detectType(transcript, locale, sanitizeCategories(categories));
  const amount = parseAmountFromTranscript(transcript, locale);

  let resolvedType = type;
  if (
    /возврат|вернули|вернула|refund|cashback|кэшбэк|кешбэк/i.test(transcript)
  ) {
    resolvedType = "income";
  }

  let categoryId = detectCategoryId(
    transcript,
    resolvedType,
    sanitizeCategories(categories),
  );
  if (/возврат|вернули|refund/i.test(transcript) && resolvedType === "income") {
    const refundCat = sanitizeCategories(categories).find(
      (c) => c.id === "refund",
    );
    if (refundCat) categoryId = "refund";
  }

  return {
    amount,
    type: resolvedType,
    categoryId: categoryId || getFallbackCategoryId(resolvedType),
    currency: APP_CURRENCY,
    note: sanitizeTransactionNote(transcript.slice(0, 120), amount),
    date: new Date().toISOString().slice(0, 10),
  };
}

export function fallbackParseMany(
  transcript: string,
  locale: Locale,
  categories: CategoryDefinition[] = getDefaultCategories(),
): ParsedTransaction[] {
  const clauses = splitTranscriptClauses(transcript);
  const compactMulti = extractCompactMultiAmountInput(transcript);
  if (clauses.length === 1 && compactMulti && compactMulti.amounts.length > 1) {
    const base = fallbackParse(
      `${compactMulti.label} ${compactMulti.amounts[0]}`,
      locale,
      categories,
    );
    if (base.amount > 0) {
      return compactMulti.amounts.map((amount) => ({
        ...base,
        amount,
        note: sanitizeTransactionNote(compactMulti.label, amount),
      }));
    }
  }

  const separatedAmounts = extractSeparatedMoneyAmounts(transcript);
  if (clauses.length === 1 && separatedAmounts.length > 1) {
    const base = fallbackParse(transcript, locale, categories);
    if (base.amount > 0) {
      return separatedAmounts.map((amount) => ({
        ...base,
        amount,
        note: sanitizeTransactionNote(transcript.slice(0, 120), amount),
      }));
    }
  }

  const items = clauses
    .map((clause) => fallbackParse(clause, locale, categories))
    .filter((item) => item.amount > 0);

  if (items.length > 0) return items;

  const single = fallbackParse(transcript, locale, categories);
  return single.amount > 0 ? [single] : [];
}

export function normalizeAiParsed(
  raw: {
    amount: number;
    type: TxType;
    category?: string;
    categoryId?: string;
    currency: ParsedTransaction["currency"];
    note: string;
    date: string;
  },
  transcript: string,
  categories: CategoryDefinition[],
  locale: Locale,
): ParsedTransaction {
  let categoryId = normalizeParsedCategory(
    raw.categoryId ?? raw.category,
    transcript,
    raw.type,
    categories,
  );
  if (categoryId === "goal_jar" && !looksLikeGoalDeposit(transcript, locale)) {
    const detected = detectCategoryId(transcript, raw.type, categories);
    categoryId =
      detected !== "goal_jar" ? detected : getFallbackCategoryId(raw.type);
  }
  const amount = resolveTransactionAmount(transcript, raw.amount, locale);

  const base: ParsedTransaction = {
    amount,
    type: raw.type,
    categoryId,
    currency: APP_CURRENCY,
    note: sanitizeTransactionNote(raw.note || transcript.slice(0, 120), amount),
    date: raw.date,
  };
  return refineParsedTransaction(
    base,
    transcript,
    categories,
    detectType,
    locale,
  );
}
