import type { CategoryDefinition, Locale, ParsedTransaction, Transaction, TxType } from "@/types";

export type AiMemoryRule = {
  phrase: string;
  categoryId: string;
  type: TxType;
  weight: number;
  signalCount: number;
  source: "voice" | "text" | "correction";
  firstSeenAt: string;
  lastSeenAt: string;
};

export type AiUserMemory = {
  version: 1;
  rules: AiMemoryRule[];
};

export type AiMemoryInsight = {
  title: string;
  detail: string;
  severity: "positive" | "neutral" | "warning";
};

const AI_MEMORY_KEY = "voicebudget-ai-memory-v1";
const MAX_RULES = 120;
const MAX_PHRASE_WORDS = 5;
const MEMORY_STOP_WORDS = new Set([
  "на",
  "за",
  "в",
  "и",
  "по",
  "руб",
  "рублей",
  "рубля",
  "рубль",
  "деньги",
  "карта",
  "карты",
  "магазин",
  "заказ",
  "заказа",
  "заказал",
  "заказала",
  "еще",
  "ещё",
  "потратил",
  "потратила",
  "потратили",
  "купил",
  "купила",
  "купили",
  "оплатил",
  "оплатила",
  "оплатили",
  "пришло",
  "пришли",
  "получил",
  "получила",
  "получили",
  "доход",
  "расход",
  "spent",
  "paid",
  "bought",
  "received",
  "income",
  "expense",
  "money",
  "card",
  "store",
  "order",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\b\d+[\d\s.,]*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(phrase: string): Set<string> {
  return new Set(normalizeText(phrase).split(" ").filter((w) => w.length >= 3));
}

function phraseSimilarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function areSimilarPhrases(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
  return phraseSimilarity(a, b) >= 0.72;
}

function mergePhraseLabel(current: string, next: string): string {
  if (next.length < current.length && areSimilarPhrases(current, next)) return next;
  return current;
}

function phraseCandidates(input: string): string[] {
  const text = normalizeText(input);
  if (!text) return [];
  const words = text
    .split(" ")
    .filter((w) => w.length >= 3 && !MEMORY_STOP_WORDS.has(w));
  const candidates = new Set<string>();
  for (let size = Math.min(MAX_PHRASE_WORDS, words.length); size >= 1; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      const phrase = words.slice(i, i + size).join(" ");
      if (phrase.length >= 3) candidates.add(phrase);
    }
  }
  return [...candidates].slice(0, 12);
}

export function getAiMemoryKeywordCandidates(input: string, limit = 3): string[] {
  return phraseCandidates(input)
    .filter((phrase) => phrase.length >= 3 && phrase.length <= 40)
    .sort((a, b) => {
      const aw = a.split(" ").length;
      const bw = b.split(" ").length;
      return aw - bw || a.length - b.length;
    })
    .slice(0, Math.max(1, limit));
}

function readAiMemory(): AiUserMemory {
  if (!canUseLocalStorage()) return { version: 1, rules: [] };
  try {
    const raw = localStorage.getItem(AI_MEMORY_KEY);
    if (!raw) return { version: 1, rules: [] };
    const parsed = JSON.parse(raw) as Partial<AiUserMemory>;
    if (parsed.version !== 1 || !Array.isArray(parsed.rules)) {
      return { version: 1, rules: [] };
    }
    return {
      version: 1,
      rules: parsed.rules
        .filter((r) =>
          Boolean(
            r &&
              typeof r.phrase === "string" &&
              typeof r.categoryId === "string" &&
              (r.type === "income" || r.type === "expense"),
          ),
        )
        .map((r) => {
          const rule = r as Partial<AiMemoryRule>;
          const lastSeenAt =
            typeof rule.lastSeenAt === "string" ? rule.lastSeenAt : nowIso();
          return {
            phrase: normalizeText(rule.phrase ?? ""),
            categoryId: String(rule.categoryId ?? ""),
            type: rule.type === "income" ? "income" : "expense",
            weight:
              typeof rule.weight === "number" && Number.isFinite(rule.weight)
                ? Math.max(1, Math.round(rule.weight))
                : 1,
            signalCount:
              typeof rule.signalCount === "number" && Number.isFinite(rule.signalCount)
                ? Math.max(1, Math.round(rule.signalCount))
                : 1,
            source:
              rule.source === "correction" || rule.source === "voice" || rule.source === "text"
                ? rule.source
                : "text",
            firstSeenAt:
              typeof rule.firstSeenAt === "string" ? rule.firstSeenAt : lastSeenAt,
            lastSeenAt,
          } satisfies AiMemoryRule;
        })
        .filter((r) => r.phrase.length >= 3 && r.categoryId.length > 0)
        .slice(0, MAX_RULES),
    };
  } catch {
    return { version: 1, rules: [] };
  }
}

function writeAiMemory(memory: AiUserMemory): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(AI_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    /* localStorage may be full or blocked */
  }
}

export function getAiMemoryRules(): AiMemoryRule[] {
  return readAiMemory().rules;
}

export function deleteAiMemoryRule(target: Pick<AiMemoryRule, "phrase" | "categoryId" | "type">): void {
  const memory = readAiMemory();
  writeAiMemory({
    version: 1,
    rules: memory.rules.filter(
      (rule) =>
        !(
          rule.phrase === target.phrase &&
          rule.categoryId === target.categoryId &&
          rule.type === target.type
        ),
    ),
  });
}

export function clearAiMemoryRules(): void {
  writeAiMemory({ version: 1, rules: [] });
}

function rememberRule(rule: Omit<AiMemoryRule, "lastSeenAt">): void {
  const memory = readAiMemory();
  const phrase = normalizeText(rule.phrase);
  if (phrase.length < 3) return;
  const existing = memory.rules.find(
    (r) =>
      r.categoryId === rule.categoryId &&
      r.type === rule.type &&
      areSimilarPhrases(r.phrase, phrase),
  );
  if (existing) {
    existing.weight = Math.min(99, existing.weight + rule.weight);
    existing.signalCount = Math.min(999, (existing.signalCount ?? 1) + 1);
    existing.phrase = mergePhraseLabel(existing.phrase, phrase);
    existing.source = rule.source === "correction" ? "correction" : existing.source;
    existing.lastSeenAt = nowIso();
  } else {
    const seenAt = nowIso();
    memory.rules.push({
      ...rule,
      phrase,
      signalCount: Math.max(1, rule.signalCount ?? 1),
      firstSeenAt: rule.firstSeenAt ?? seenAt,
      lastSeenAt: seenAt,
    });
  }
  memory.rules.sort((a, b) => b.weight - a.weight || b.lastSeenAt.localeCompare(a.lastSeenAt));
  writeAiMemory({ version: 1, rules: memory.rules.slice(0, MAX_RULES) });
}

export function recordAiInputLearning(
  transcript: string | undefined,
  tx: Pick<ParsedTransaction | Transaction, "categoryId" | "type" | "note">,
  source: "voice" | "text" = "text",
): void {
  const seed = `${transcript ?? ""} ${tx.note ?? ""}`.trim();
  if (!seed || !tx.categoryId) return;
  for (const phrase of phraseCandidates(seed).slice(0, 4)) {
    rememberRule({
      phrase,
      categoryId: tx.categoryId,
      type: tx.type,
      weight: source === "voice" ? 2 : 1,
      signalCount: 1,
      source,
      firstSeenAt: nowIso(),
    });
  }
}

export function recordAiCorrectionLearning(params: {
  before?: Pick<Transaction, "categoryId" | "type" | "note"> | null;
  after: Pick<Transaction, "categoryId" | "type" | "note">;
}): void {
  const { before, after } = params;
  if (before?.categoryId === after.categoryId && before?.type === after.type) return;
  const sourceText = `${before?.note ?? ""} ${after.note ?? ""}`.trim();
  const learnedPhrases = phraseCandidates(sourceText).slice(0, 6);
  for (const phrase of learnedPhrases) {
    rememberRule({
      phrase,
      categoryId: after.categoryId,
      type: after.type,
      weight: 7,
      signalCount: 1,
      source: "correction",
      firstSeenAt: nowIso(),
    });
  }
}

export function enrichCategoriesWithAiMemory(
  categories: CategoryDefinition[],
): CategoryDefinition[] {
  const memory = readAiMemory();
  if (memory.rules.length === 0) return categories;
  const extraByCategory = new Map<string, Set<string>>();
  for (const rule of memory.rules) {
    if (rule.weight < 2) continue;
    const set = extraByCategory.get(rule.categoryId) ?? new Set<string>();
    set.add(rule.phrase);
    extraByCategory.set(rule.categoryId, set);
  }
  return categories.map((cat) => {
    const extra = extraByCategory.get(cat.id);
    if (!extra?.size) return cat;
    return {
      ...cat,
      keywords: [...new Set([...cat.keywords, ...extra])],
    };
  });
}

export function matchAiMemoryCategoryId(
  text: string,
  type: TxType,
  categories: CategoryDefinition[],
): string | null {
  const memory = readAiMemory();
  if (memory.rules.length === 0) return null;

  const categoryIds = new Set(categories.filter((cat) => cat.type === type).map((cat) => cat.id));
  const candidates = new Set(phraseCandidates(text));
  let best: AiMemoryRule | null = null;

  for (const rule of memory.rules) {
    if (rule.type !== type || !categoryIds.has(rule.categoryId)) continue;
    const matches = candidates.has(rule.phrase) || [...candidates].some((candidate) => areSimilarPhrases(candidate, rule.phrase));
    if (!matches) continue;
    if (!best || rule.weight > best.weight || rule.lastSeenAt > best.lastSeenAt) {
      best = rule;
    }
  }

  return best?.categoryId ?? null;
}

export function aiMemoryConfidence(rule: AiMemoryRule): number {
  const sourceBoost = rule.source === "correction" ? 22 : rule.source === "voice" ? 10 : 4;
  const weightScore = Math.min(45, Math.round(rule.weight * 3.2));
  const signalScore = Math.min(25, Math.round((rule.signalCount ?? 1) * 6));
  return Math.max(35, Math.min(98, 28 + sourceBoost + weightScore + signalScore));
}

export function aiMemoryReason(rule: AiMemoryRule, locale: Locale): string {
  const confidence = aiMemoryConfidence(rule);
  if (locale !== "ru") {
    if (rule.source === "correction") {
      return `You corrected this category. Confidence ${confidence}%.`;
    }
    return `${rule.signalCount} signal(s) from ${rule.source}. Confidence ${confidence}%.`;
  }
  if (rule.source === "correction") {
    return `Вы исправили категорию вручную. Уверенность ${confidence}%.`;
  }
  const source = rule.source === "voice" ? "голоса" : "текста";
  return `${rule.signalCount} сигнал(ов) из ${source}. Уверенность ${confidence}%.`;
}

export function buildAiMemorySnapshot(
  transactions: Transaction[],
  categories: CategoryDefinition[],
  locale: Locale,
): {
  learnedRules: AiMemoryRule[];
  frequentMerchants: { phrase: string; categoryId: string; count: number }[];
  categoryHabits: { category: string; count: number; avgAmount: number; sharePercent: number }[];
  insights: AiMemoryInsight[];
} {
  const memory = readAiMemory();
  const confirmed = transactions.filter((tx) => tx.confirmed !== false);
  const expense = confirmed.filter((tx) => tx.type === "expense");
  const totalExpense = expense.reduce((s, tx) => s + tx.amount, 0);
  const byCategory = new Map<string, { count: number; amount: number }>();
  for (const tx of expense) {
    const prev = byCategory.get(tx.categoryId) ?? { count: 0, amount: 0 };
    prev.count += 1;
    prev.amount += tx.amount;
    byCategory.set(tx.categoryId, prev);
  }
  const label = (id: string) => {
    const cat = categories.find((c) => c.id === id);
    return cat ? (locale === "ru" ? cat.labels.ru : cat.labels.en) : id;
  };
  const categoryHabits = [...byCategory.entries()]
    .map(([categoryId, v]) => ({
      category: label(categoryId),
      count: v.count,
      avgAmount: Math.round(v.amount / Math.max(1, v.count)),
      sharePercent: totalExpense > 0 ? Math.round((v.amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.sharePercent - a.sharePercent)
    .slice(0, 6);

  const phraseMap = new Map<string, { categoryId: string; count: number }>();
  for (const tx of confirmed) {
    for (const phrase of phraseCandidates(tx.note).slice(0, 2)) {
      const prev = phraseMap.get(phrase) ?? { categoryId: tx.categoryId, count: 0 };
      prev.count += 1;
      phraseMap.set(phrase, prev);
    }
  }
  const frequentMerchants = [...phraseMap.entries()]
    .map(([phrase, v]) => ({ phrase, categoryId: v.categoryId, count: v.count }))
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const insights: AiMemoryInsight[] = [];
  const top = categoryHabits[0];
  if (top) {
    insights.push({
      title: locale === "ru" ? "Главная привычка периода" : "Main habit this period",
      detail:
        locale === "ru"
          ? `${top.category}: ${top.sharePercent}% расходов, средний чек ${top.avgAmount} ₽.`
          : `${top.category}: ${top.sharePercent}% of expenses, avg ${top.avgAmount} RUB.`,
      severity: top.sharePercent >= 35 ? "warning" : "neutral",
    });
  }
  if (memory.rules.some((r) => r.source === "correction")) {
    insights.push({
      title: locale === "ru" ? "ИИ учится на исправлениях" : "AI learns from corrections",
      detail:
        locale === "ru"
          ? "Исправленные категории уже добавлены в персональные правила распознавания."
          : "Corrected categories are now used as personal recognition rules.",
      severity: "positive",
    });
  }

  return {
    learnedRules: memory.rules.slice(0, 20),
    frequentMerchants,
    categoryHabits,
    insights,
  };
}
