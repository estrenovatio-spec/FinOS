import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import { matchAiMemoryCategoryId } from "@/lib/ai-memory";
import { isIncomeReceiptPhrase, looksLikeGoalDeposit } from "@/lib/planning/parse-input";
import { isGarbageTranscript } from "@/lib/transcript-guard";
import type { CategoryDefinition, Locale, ParsedTransaction, TxType } from "@/types";

export type { CategoryDefinition } from "@/types";

export { DEFAULT_CATEGORIES };

/** Старый id «Еда» → продукты; рестораны — отдельная категория */
export const LEGACY_CATEGORY_ID_MAP: Record<string, string> = {
  food: "groceries",
  vacation: "leisure",
};

export function migrateCategoryId(categoryId: string): string {
  return LEGACY_CATEGORY_ID_MAP[categoryId] ?? categoryId;
}

/** Удалённая категория «Еда» — не показывать в списке */
export function isRetiredCategoryId(id: string): boolean {
  return id === "food" || id === "vacation";
}

function isObsoleteFoodCategory(cat: CategoryDefinition): boolean {
  if (isRetiredCategoryId(cat.id)) return true;
  const ru = cat.labels?.ru?.trim().toLowerCase();
  const en = cat.labels?.en?.trim().toLowerCase();
  if (ru === "еда" && cat.id !== "groceries" && cat.id !== "dining_out") return true;
  if (en === "food" && cat.id !== "groceries" && cat.id !== "dining_out") return true;
  return false;
}

const LEGACY_LABEL_TO_ID: Record<string, string> = {
  еда: "groceries",
  food: "groceries",
  продукты: "groceries",
  продукт: "groceries",
  "кафе и рестораны": "dining_out",
  ресторан: "dining_out",
  кафе: "dining_out",
  обед: "dining_out",
  ужин: "dining_out",
  завтрак: "dining_out",
  ланч: "dining_out",
  такси: "transport",
  transport: "transport",
  прочее: "other",
  other: "other",
  доход: "income_other",
  income: "income_other",
  "прочий доход": "income_other",
  "other income": "income_other",
  зарплата: "salary",
  salary: "salary",
  аренда: "rent",
  rent: "rent",
  одежда: "clothing",
  clothing: "clothing",
  "банки и кредиты": "banking",
  банк: "banking",
  кредит: "banking",
  отдых: "leisure",
  отпуск: "leisure",
  развлечения: "entertainment",
  подарки: "gifts",
  подарок: "gifts",
  пожертвование: "charity",
  пожертвования: "charity",
  "регулярные платежи": "recurring",
  услуги: "services",
  хознужды: "household_supplies",
  "хоз нужды": "household_supplies",
};

export function getDefaultCategories(): CategoryDefinition[] {
  return DEFAULT_CATEGORIES.map((c) => ({ ...c, keywords: [...c.keywords] }));
}

function normalizeCategory(raw: unknown, fallback?: CategoryDefinition): CategoryDefinition | null {
  if (!raw || typeof raw !== "object") return fallback ?? null;
  const item = raw as Partial<CategoryDefinition>;
  const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : fallback?.id;
  const type =
    item.type === "income" || item.type === "expense" ? item.type : fallback?.type ?? "expense";
  if (!id) return fallback ?? null;

  const labelsRaw = item.labels as { ru?: string; en?: string } | undefined;
  const ru =
    typeof labelsRaw?.ru === "string" && labelsRaw.ru.trim()
      ? labelsRaw.ru.trim()
      : (fallback?.labels.ru ?? id);
  const en =
    typeof labelsRaw?.en === "string" && labelsRaw.en.trim()
      ? labelsRaw.en.trim()
      : (fallback?.labels.en ?? ru);

  const keywords = Array.isArray(item.keywords)
    ? item.keywords.filter((k): k is string => typeof k === "string").map((k) => k.trim().toLowerCase()).filter(Boolean)
    : (fallback?.keywords ?? []);

  return {
    id,
    type,
    labels: { ru, en },
    keywords,
    isSystem: Boolean(item.isSystem ?? fallback?.isSystem),
  };
}

/** Восстанавливает категории из localStorage — битые записи не роняют UI */
export function sanitizeCategories(input: unknown): CategoryDefinition[] {
  const defaults = getDefaultCategories();
  const byId = new Map(defaults.map((c) => [c.id, { ...c }]));

  if (Array.isArray(input)) {
    for (const raw of input) {
      let id =
        raw && typeof raw === "object" && typeof (raw as CategoryDefinition).id === "string"
          ? (raw as CategoryDefinition).id
          : null;
      if (id) id = migrateCategoryId(id);
      const normalized = normalizeCategory(raw, id ? byId.get(id) : undefined);
      if (!normalized) continue;
      const existing = byId.get(normalized.id);
      const fresh = defaults.find((d) => d.id === normalized.id);
      if (fresh?.isSystem) {
        const keywords = [...new Set([...fresh.keywords, ...normalized.keywords])];
        byId.set(normalized.id, { ...fresh, ...normalized, keywords, isSystem: true });
      } else if (!isObsoleteFoodCategory(normalized)) {
        byId.set(normalized.id, normalized);
      }
    }
  }

  return Array.from(byId.values()).filter((c) => !isObsoleteFoodCategory(c));
}

export function getCategoryLabel(
  categoryId: string,
  categories: CategoryDefinition[],
  locale: Locale,
): string {
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat?.labels) return categoryId;
  const label = locale === "ru" ? cat.labels.ru : cat.labels.en;
  return label?.trim() || categoryId;
}

export function sortCategoriesByLabel(
  list: CategoryDefinition[],
  allCategories: CategoryDefinition[],
  locale: Locale,
): CategoryDefinition[] {
  const collator = locale === "ru" ? "ru" : "en";
  return [...list].sort((a, b) =>
    getCategoryLabel(a.id, allCategories, locale).localeCompare(
      getCategoryLabel(b.id, allCategories, locale),
      collator,
      { sensitivity: "base" },
    ),
  );
}

export function getCategoriesByType(
  categories: CategoryDefinition[],
  type: TxType,
  locale?: Locale,
): CategoryDefinition[] {
  const filtered = categories.filter((c) => c.type === type);
  return locale ? sortCategoriesByLabel(filtered, categories, locale) : filtered;
}

export function getFallbackCategoryId(type: TxType): string {
  return type === "income" ? "income_other" : "other";
}

/** Короткие ключи — только целое слово, чтобы не ловить «особенность» → «обед» */
function keywordMatches(text: string, kw: string): boolean {
  const needle = kw.trim().toLowerCase();
  if (!needle) return false;
  if (needle.length <= 5) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[\\s,.;:!?()—–-])${escaped}($|[\\s,.;:!?()—–-])`, "i").test(
      ` ${text.trim()} `,
    );
  }
  return text.toLowerCase().includes(needle);
}

const DYNAMIC_PRIORITY_CATEGORY_IDS: Record<TxType, string[]> = {
  expense: [
    "groceries",
    "dining_out",
    "transport",
    "kids_family",
    "health",
    "shopping",
    "clothing",
    "gifts",
  ],
  income: ["salary", "freelance", "refund"],
};

const PHRASE_CATEGORY_RULES: { pattern: RegExp; categoryId: string; type?: TxType }[] = [
  {
    pattern: /(?:зарплат|аванс|оклад|получк|преми|paycheck|payroll|salary|bonus|wage)/i,
    categoryId: "salary",
    type: "income",
  },
  {
    pattern:
      /(?:фриланс|заказчик|клиент\s+оплатил|оплатил\s+клиент|аренда\s+пришл|арендн(?:ая|ый)?\s+плат|сдача\s+квартир|сдали\s+квартиру|сдаю\s+квартиру|самозанят|подработк|проект|invoice|contract|gig|freelance|rental income|sublease)/i,
    categoryId: "freelance",
    type: "income",
  },
  {
    pattern: /(?:возврат|вернул|кэшбэк|кешбэк|cashback|refund|chargeback|компенсац|перерасч)/i,
    categoryId: "refund",
    type: "income",
  },
  {
    pattern:
      /(?:авито|техник|гаджет|маркетплейс|яндекс\s*маркет|алиэкспресс|озон|wildberries|\bwb\b|м\.?\s?видео|dns|ситилинк|amazon|shopping|mall)/i,
    categoryId: "shopping",
    type: "expense",
  },
  {
    pattern: /(?:одежд|куртк|кроссовк|обув|пальт|джинс|футболк|lamoda|zara|nike|adidas|uniqlo|shein|шмот)/i,
    categoryId: "clothing",
    type: "expense",
  },
  { pattern: /(?:подарок|подарки|букет|цветы)/i, categoryId: "gifts", type: "expense" },
  {
    pattern: /(?:врач|аптек|стоматолог|анализ|клиник|таблетк|лекарств|мрт|узи|поликлиник|больниц|доктор|оптик|очки|health|pharmacy|doctor)/i,
    categoryId: "health",
    type: "expense",
  },
  {
    pattern: /(?:школ|садик|сад\b|марфа|арсений|кружок|репетитор|дет[а-яё]*|нян|секци|лагер|игрушк|подгуз|пеленк|смесь|педиатр|school fee|kindergarten|kids|toys)/i,
    categoryId: "kids_family",
    type: "expense",
  },
  {
    pattern: /(?:такси|бензин|метро|автобус|парковк|заправк|каршеринг|электричк|тройк|ржд|аэроэкспресс|uber|taxi|whoosh|bus|train|fuel|parking|яндекс\s*(?:go|такси))/i,
    categoryId: "transport",
    type: "expense",
  },
  {
    pattern: /(?:кофе|кафе|ресторан|обед|ужин|доставк|еда\s+вне\s+дома|кофейн|пицц|суши|бургер|шаверм|шаурм|столов|пекарн|шоколадниц|додо|теремок|ростикс|kfc|starbucks|delivery|takeaway|yandex eats)/i,
    categoryId: "dining_out",
    type: "expense",
  },
  {
    pattern: /(?:продукт|пятерочк|пятёрочк|перекрестк|перекрёстк|магазин|еда\s+домой|вкусвилл|самокат|сбермаркет|ашан|лента|магнит|дикси|спар|spar|супермаркет|гипермаркет|рынок|лавка|купер|яндекс\s*лавка)/i,
    categoryId: "groceries",
    type: "expense",
  },
  { pattern: /фестивал|festival/i, categoryId: "entertainment" },
  { pattern: /ретрит|retreat/i, categoryId: "entertainment" },
  { pattern: /аква[\s-]?парк|aquapark|water\s*park/i, categoryId: "entertainment" },
  { pattern: /остров\s+мечты|острове\s+мечты|dream\s*island/i, categoryId: "entertainment" },
  { pattern: /парк\s+развлеч|тематическ\w*\s+парк|legoland|диснейленд|disneyland/i, categoryId: "entertainment" },
  { pattern: /(?:на|за|в)\s+обед/u, categoryId: "dining_out" },
  { pattern: /(?:на|за|в)\s+ужин/u, categoryId: "dining_out" },
  { pattern: /(?:на|за|в)\s+завтрак/u, categoryId: "dining_out" },
  { pattern: /(?:на|за)\s+ланч/u, categoryId: "dining_out" },
  { pattern: /пообед/u, categoryId: "dining_out" },
  { pattern: /поужин/u, categoryId: "dining_out" },
  { pattern: /бизнес[\s-]?ланч/u, categoryId: "dining_out" },
  { pattern: /в\s+кафе/u, categoryId: "dining_out" },
  { pattern: /в\s+ресторан/u, categoryId: "dining_out" },
];

function detectCategoryFromPriorityCatalog(
  text: string,
  type: TxType,
  categories: CategoryDefinition[],
): string | null {
  const priorityIds = DYNAMIC_PRIORITY_CATEGORY_IDS[type];
  let bestId: string | null = null;
  let bestScore = 0;

  for (const categoryId of priorityIds) {
    const category = categories.find((item) => item.id === categoryId && item.type === type);
    if (!category) continue;
    const score = scoreCategoryKeywords(text, category);
    if (score > bestScore) {
      bestScore = score;
      bestId = category.id;
    }
  }

  return bestScore > 0 ? bestId : null;
}

function detectCategoryFromPhrases(
  text: string,
  type: TxType,
  categories: CategoryDefinition[],
): string | null {
  const fromCatalog = detectCategoryFromPriorityCatalog(text, type, categories);
  if (fromCatalog) return fromCatalog;

  for (const rule of PHRASE_CATEGORY_RULES) {
    if (rule.type && rule.type !== type) continue;
    if (rule.pattern.test(text)) return rule.categoryId;
  }
  return null;
}

const RU_EXPENSE_TYPE_HINTS = [
  "потратил",
  "потратила",
  "потратили",
  "купил",
  "купила",
  "купили",
  "оплатил",
  "оплатила",
  "оплатили",
  "отдал",
  "отдала",
  "отдали",
  "заплатил",
  "заплатила",
  "заплатили",
  "списали",
  "списалось",
  "расход",
];
const RU_INCOME_TYPE_HINTS = [
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
  "поступило",
  "поступили",
  "возврат",
  "вернули",
  "клиент оплатил",
  "оплатил клиент",
  "заказчик оплатил",
  "аренда пришла",
  "арендная плата",
];
const EN_EXPENSE_TYPE_HINTS = ["spent", "bought", "paid", "expense"];
const EN_INCOME_TYPE_HINTS = ["received", "salary", "income", "earned", "got paid"];

/** «Потратил», «отдал» и т.д. важнее одинакового keyword «мастер» в доходах и расходах */
export function detectTypeFromVerbs(text: string, locale: Locale): TxType | null {
  const lower = text.toLowerCase();
  const incomeHints = locale === "ru" ? RU_INCOME_TYPE_HINTS : EN_INCOME_TYPE_HINTS;
  const expenseHints = locale === "ru" ? RU_EXPENSE_TYPE_HINTS : EN_EXPENSE_TYPE_HINTS;
  const isIncome = incomeHints.some((w) => lower.includes(w));
  const isExpense = expenseHints.some((w) => lower.includes(w));
  if (isExpense && !isIncome) return "expense";
  if (isIncome && !isExpense) return "income";
  return null;
}

export function scoreCategoryKeywords(text: string, category: CategoryDefinition): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of category.keywords) {
    if (kw && keywordMatches(lower, kw)) {
      const base = kw.length >= 5 ? 3 : 2;
      score += kw.includes(" ") ? base + 6 : base;
    }
  }
  const labelRu = category.labels?.ru?.toLowerCase() ?? "";
  const labelEn = category.labels?.en?.toLowerCase() ?? "";
  if (labelRu.length > 2 && keywordMatches(lower, labelRu)) score += 4;
  if (labelEn.length > 2 && keywordMatches(lower, labelEn)) score += 4;
  return score;
}

/** Доход/расход по keywords категорий (в т.ч. пользовательских). */
export function detectTypeFromCategories(
  text: string,
  categories: CategoryDefinition[],
): TxType | null {
  const merged = sanitizeCategories(categories);
  let incomeScore = 0;
  let expenseScore = 0;
  for (const cat of merged) {
    const score = scoreCategoryKeywords(text, cat);
    if (cat.type === "income") incomeScore = Math.max(incomeScore, score);
    else if (cat.type === "expense") expenseScore = Math.max(expenseScore, score);
  }
  if (expenseScore > incomeScore) return "expense";
  if (incomeScore > expenseScore) return "income";
  return null;
}

/** Пересчёт type/categoryId по полному списку категорий (после LLM или без него). */
export function refineParsedTransaction(
  item: ParsedTransaction,
  clause: string,
  categories: CategoryDefinition[],
  detectTypeFn: (text: string, locale: Locale, cats?: CategoryDefinition[]) => TxType,
  locale: Locale,
): ParsedTransaction {
  const text = `${clause} ${item.note ?? ""}`.trim();
  const merged = sanitizeCategories(categories);
  const fromVerbs = detectTypeFromVerbs(text, locale);
  const fromCats = detectTypeFromCategories(text, merged);
  const fromKw = detectTypeFn(text, locale, merged);
  let type: TxType = item.type;
  if (isIncomeReceiptPhrase(text, locale)) {
    type = "income";
  } else if (fromVerbs) {
    type = fromVerbs;
  } else if (fromCats === "expense") {
    type = "expense";
  } else if (fromCats === "income") {
    type = "income";
  } else {
    type = fromKw;
  }
  let categoryId = detectCategoryId(text, type, merged);
  if (
    isIncomeReceiptPhrase(text, locale) &&
    type === "income" &&
    categoryId === "goal_jar"
  ) {
    categoryId = getFallbackCategoryId("income");
  }
  return { ...item, type, categoryId };
}

export function detectCategoryId(
  text: string,
  type: TxType,
  categories: CategoryDefinition[],
): string {
  const merged = sanitizeCategories(categories);
  const canUseGoalJar = looksLikeGoalDeposit(text, "ru") || looksLikeGoalDeposit(text, "en");
  const fromMemory = matchAiMemoryCategoryId(text, type, merged);
  if (
    fromMemory &&
    !(
      fromMemory === "goal_jar" &&
      !canUseGoalJar
    )
  ) {
    return fromMemory;
  }

  const fromPhrase = detectCategoryFromPhrases(text, type, merged);
  if (
    fromPhrase &&
    fromPhrase !== "goal_jar" &&
    merged.some((c) => c.id === fromPhrase && c.type === type)
  ) {
    return fromPhrase;
  }

  const pool = getCategoriesByType(merged, type).filter(
    (c) =>
      c.id !== getFallbackCategoryId(type) &&
      (c.id !== "goal_jar" || canUseGoalJar),
  );
  let bestId = getFallbackCategoryId(type);
  let bestScore = 0;

  for (const cat of pool) {
    const score = scoreCategoryKeywords(text, cat);
    if (score > bestScore) {
      bestScore = score;
      bestId = cat.id;
    }
  }

  return bestId;
}

/** Достаточно ли текста с микрофона, чтобы не ждать серверный STT */
export function isTranscriptLikelyComplete(
  text: string,
  type: TxType,
  categories: CategoryDefinition[] = getDefaultCategories(),
): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  const merged = sanitizeCategories(categories);
  if (detectCategoryId(trimmed, type, merged) !== getFallbackCategoryId(type)) return true;
  if (trimmed.length >= 22) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 5;
}

export function pickBestVoiceTranscript(
  speechText: string,
  serverText: string,
  locale: Locale,
  categories: CategoryDefinition[] = getDefaultCategories(),
): string {
  const s = speechText.trim();
  const t = serverText.trim();
  const sOk = s.length >= 2 && !isGarbageTranscript(s);
  const tOk = t.length >= 2 && !isGarbageTranscript(t);
  if (!sOk && !tOk) return "";
  if (!sOk) return t;
  if (!tOk) return s;
  if (s === t) return s;

  const merged = sanitizeCategories(categories);
  const sl = s.toLowerCase();
  const tl = t.toLowerCase();
  if (tl.includes(sl) && t.length > s.length + 1) return t;
  if (sl.includes(tl) && s.length > t.length + 1) return s;

  const incomeHints = /получил|зарплат|доход|пришло|зачисли|received|salary|income|earned/i;
  const txType: TxType = incomeHints.test(s) || incomeHints.test(t) ? "income" : "expense";

  const catS = detectCategoryId(s, txType, merged);
  const catT = detectCategoryId(t, txType, merged);
  const fallback = getFallbackCategoryId(txType);
  if (catS === fallback && catT !== fallback) return t;
  if (catT === fallback && catS !== fallback) return s;

  return t.length >= s.length ? t : s;
}

export function matchCategoryIdFromText(
  raw: string,
  type: TxType,
  categories: CategoryDefinition[],
): string {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return getFallbackCategoryId(type);

  const migrated = migrateCategoryId(normalized);
  const byId = categories.find((c) => c.id.toLowerCase() === migrated && c.type === type);
  if (byId) return byId.id;

  const legacy = LEGACY_LABEL_TO_ID[normalized];
  if (legacy && categories.some((c) => c.id === legacy && c.type === type)) {
    return legacy;
  }

  for (const cat of categories) {
    if (cat.type !== type) continue;
    const ru = cat.labels?.ru?.toLowerCase() ?? "";
    const en = cat.labels?.en?.toLowerCase() ?? "";
    if (ru === normalized || en === normalized) {
      return cat.id;
    }
  }

  const detected = detectCategoryId(raw, type, categories);
  if (detected !== getFallbackCategoryId(type)) return detected;

  return detectCategoryId(raw, type, categories);
}

export function normalizeParsedCategory(
  rawCategory: string | undefined,
  transcript: string,
  type: TxType,
  categories: CategoryDefinition[],
): string {
  const text = `${transcript} ${rawCategory ?? ""}`.trim();
  const fallback = getFallbackCategoryId(type);
  const fromSpeech = detectCategoryId(text, type, categories);
  if (fromSpeech !== fallback) return fromSpeech;
  if (rawCategory?.trim()) {
    return matchCategoryIdFromText(rawCategory, type, categories);
  }
  return fallback;
}

export function getCategoryIdsForPrompt(
  categories: CategoryDefinition[],
  type: TxType,
  locale: Locale,
): string {
  return getCategoriesByType(categories, type, locale)
    .map((c) => `${c.id} (${locale === "ru" ? c.labels.ru : c.labels.en})`)
    .join(", ");
}

const PROMPT_KEYWORDS_PER_CATEGORY = 18;

/** Полный каталог для LLM: id, название и keywords (свои категории — в приоритете). */
export function formatCategoryCatalogForPrompt(
  categories: CategoryDefinition[],
  type: TxType,
  locale: Locale,
): string {
  const merged = getCategoriesByType(sanitizeCategories(categories), type, locale);
  if (merged.length === 0) {
    return locale === "ru" ? "  (нет категорий)" : "  (no categories)";
  }

  const customFirst = [...merged].sort((a, b) => {
    const aCustom = a.isSystem === false ? 0 : 1;
    const bCustom = b.isSystem === false ? 0 : 1;
    if (aCustom !== bCustom) return aCustom - bCustom;
    const labelA = locale === "ru" ? a.labels.ru : a.labels.en;
    const labelB = locale === "ru" ? b.labels.ru : b.labels.en;
    return labelA.localeCompare(labelB, locale);
  });

  return customFirst
    .map((c) => {
      const label = locale === "ru" ? c.labels.ru : c.labels.en;
      const kws = (c.keywords ?? []).filter(Boolean).slice(0, PROMPT_KEYWORDS_PER_CATEGORY);
      const kwLine =
        kws.length > 0
          ? locale === "ru"
            ? `слова: ${kws.join(", ")}`
            : `keywords: ${kws.join(", ")}`
          : locale === "ru"
            ? "без отдельных слов — ориентируйся на название"
            : "no extra keywords — use label";
      const tag =
        c.isSystem === false
          ? locale === "ru"
            ? " [своя категория — при совпадении слова выбирай её]"
            : " [user category — prefer when a keyword matches]"
          : "";
      return `  • categoryId "${c.id}" — ${label}${tag}\n    ${kwLine}`;
    })
    .join("\n");
}

export function slugifyCategoryId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || `custom-${Date.now()}`
  );
}
