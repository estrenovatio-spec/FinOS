import type { BudgetOwner, Locale } from "@/types";

export type OwnerDetectOptions = {
  partnerName?: string | null;
  /** Слова из настроек: жена, муж, ксюша, любимая, алексей… */
  partnerKeywords?: readonly string[];
  myName?: string | null;
  locale?: Locale;
  hasPartner?: boolean;
};

const GIFT_VERBS_RU = [
  "купил",
  "купила",
  "подарил",
  "подарила",
  "дал",
  "дала",
  "взял",
  "взяла",
  "заказал",
  "заказала",
  "перевёл",
  "перевел",
  "перевела",
  "отправил",
  "отправила",
  "заплатил",
  "заплатила",
];

const GIFT_VERBS_EN = [
  "bought",
  "buy",
  "gave",
  "gifted",
  "ordered",
  "paid for",
  "paid",
];

const ME_WORDS_RU = [
  "мне",
  "мной",
  "меня",
  "мой",
  "моя",
  "моё",
  "мои",
  "я",
  "для меня",
  "у меня",
];

const ME_WORDS_EN = ["my", "mine", "me", "i", "myself", "for me"];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Варианты имени для поиска в речи (Ксюша → ксюша, ксюш). */
export function nameNeedles(name: string): string[] {
  const raw = name.trim().toLowerCase();
  if (!raw) return [];
  const first = raw.split(/\s+/)[0] ?? raw;
  const needles = new Set<string>([raw, first]);
  if (first.length >= 3) {
    needles.add(first.slice(0, -1));
    needles.add(first.slice(0, Math.max(3, first.length - 2)));
    if (first.length >= 4) needles.add(first.slice(0, 4));
    if (first.length >= 5) needles.add(first.slice(0, 5));
  }
  return [...needles].filter((n) => n.length >= 2);
}

export function parsePartnerKeywordsInput(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 2);
}

/** Имя партнёра + пользовательские слова для распознавания в фразе. */
export function collectPartnerNeedles(
  partnerName: string | null | undefined,
  partnerKeywords: readonly string[] | undefined,
): string[] {
  const set = new Set<string>();
  for (const n of nameNeedles(partnerName?.trim() ?? "")) {
    set.add(n);
  }
  for (const kw of partnerKeywords ?? []) {
    const k = kw.trim().toLowerCase();
    if (k.length >= 2) set.add(k);
    for (const n of nameNeedles(k)) {
      set.add(n);
    }
  }
  return [...set];
}

export function hasPartnerDetectionConfig(
  partnerName: string | null | undefined,
  partnerKeywords?: readonly string[],
): boolean {
  return collectPartnerNeedles(partnerName, partnerKeywords).length > 0;
}

function mentionsByNeedles(text: string, needles: string[]): boolean {
  if (!needles.length) return false;
  const lower = text.toLowerCase();
  const padded = ` ${lower} `;
  for (const needle of needles) {
    if (!needle) continue;
    if (needle.length <= 5) {
      const re = new RegExp(
        `(?:^|[\\s,.;:!?()—–-])${escapeRegExp(needle)}[a-zа-яё]{0,5}(?:[\\s,.;:!?()—–-]|$)`,
        "i",
      );
      if (re.test(padded)) return true;
    } else if (lower.includes(needle)) {
      const re = new RegExp(
        `(?:^|[\\s,.;:!?()—–-])${escapeRegExp(needle)}[a-zа-яё]{0,5}(?:[\\s,.;:!?()—–-]|$)`,
        "i",
      );
      if (re.test(padded)) return true;
    }
  }
  return false;
}

function isPartnerBeneficiaryPhrase(
  text: string,
  partnerNeedles: string[],
  locale: Locale,
): boolean {
  if (partnerNeedles.length === 0) return false;
  const lower = text.toLowerCase();

  for (const kw of partnerNeedles) {
    if (kw.length < 2) continue;
    const re = new RegExp(`\\bдля\\s+${escapeRegExp(kw)}\\b`, locale === "ru" ? "iu" : "i");
    if (re.test(lower)) return true;
  }

  const verbs = locale === "ru" ? GIFT_VERBS_RU : GIFT_VERBS_EN;
  for (const verb of verbs) {
    if (!lower.includes(verb)) continue;
    for (const kw of partnerNeedles) {
      if (kw.length < 2) continue;
      const idx = lower.indexOf(kw);
      if (idx < 0) continue;
      const before = lower.slice(0, idx);
      if (before.includes(verb)) return true;
    }
  }

  return false;
}

function stripPartnerBeneficiary(
  text: string,
  partnerNeedles: string[],
  locale: Locale,
): string {
  if (!isPartnerBeneficiaryPhrase(text, partnerNeedles, locale)) return text;
  let result = text;
  const verbs = locale === "ru" ? GIFT_VERBS_RU : GIFT_VERBS_EN;
  for (const verb of verbs) {
    for (const kw of partnerNeedles) {
      if (kw.length < 2) continue;
      result = result.replace(
        new RegExp(
          `${escapeRegExp(verb)}\\s+(?:[\\p{L}\\d\\s]{0,40}\\s+)?${escapeRegExp(kw)}`,
          "giu",
        ),
        " ",
      );
    }
  }
  for (const kw of partnerNeedles) {
    if (kw.length < 2) continue;
    result = result.replace(
      new RegExp(`\\bдля\\s+${escapeRegExp(kw)}\\b`, "giu"),
      " ",
    );
  }
  return result;
}

function meSynonymNeedles(locale: Locale): string[] {
  const words = locale === "ru" ? ME_WORDS_RU : ME_WORDS_EN;
  return words.filter((w) => w.length >= 2);
}

/** Подсказка для LLM — только имена и слова из настроек. */
export function ownerHintsForPrompt(
  locale: Locale,
  partnerName?: string | null,
  myName?: string | null,
  partnerKeywords?: readonly string[],
): string {
  const partner = partnerName?.trim();
  const me = myName?.trim();
  const kws = (partnerKeywords ?? []).filter((k) => k.trim().length >= 2);
  const lines: string[] = [];

  if (partner) {
    lines.push(
      locale === "ru"
        ? `- Имя партнёра в настройках: «${partner}» → операция партнёра.`
        : `- Partner name in settings: «${partner}» → partner's transaction.`,
    );
  }
  if (kws.length > 0) {
    lines.push(
      locale === "ru"
        ? `- Слова партнёра из настроек (если есть в фразе — это он/она, не вы): ${kws.join(", ")}.`
        : `- Partner keywords from settings (if in phrase — partner, not you): ${kws.join(", ")}.`,
    );
  }
  lines.push(
    locale === "ru"
      ? `- «купил жене цветы» / «для ксюши» — трата пользователя (подарок партнёру), не партнёра.`
      : `- "bought for [partner keyword]" → user's expense (gift), not partner's.`,
  );
  if (me) {
    lines.push(
      locale === "ru"
        ? `- Имя пользователя в настройках: «${me}» → операция пользователя.`
        : `- User name in settings: «${me}» → user's transaction.`,
    );
  }
  lines.push(
    locale === "ru"
      ? `- «мне», «я», «мой» без слов партнёра → пользователь.`
      : `- "me", "my", "I" without partner keywords → user.`,
  );
  return lines.join("\n");
}

/**
 * Кто совершил операцию: слова партнёра из настроек, затем имя пользователя.
 */
export function detectOwnerFromTranscript(
  transcript: string,
  opts: OwnerDetectOptions | string | null | undefined,
  legacyLocale?: Locale,
): BudgetOwner | null {
  const options: OwnerDetectOptions =
    typeof opts === "string" || opts === null || opts === undefined
      ? { partnerName: opts, locale: legacyLocale ?? "ru" }
      : opts;

  const text = transcript.trim();
  if (!text) return null;

  const locale = options.locale ?? "ru";
  const partnerNeedles = collectPartnerNeedles(
    options.partnerName,
    options.partnerKeywords,
  );
  const hasPartner =
    options.hasPartner ??
    hasPartnerDetectionConfig(options.partnerName, options.partnerKeywords);

  if (!hasPartner || partnerNeedles.length === 0) {
    const myCustom = options.myName?.trim();
    if (myCustom && mentionsByNeedles(text, nameNeedles(myCustom))) return "me";
    if (mentionsByNeedles(text, meSynonymNeedles(locale))) return "me";
    return null;
  }

  const scoped = stripPartnerBeneficiary(text, partnerNeedles, locale);

  if (mentionsByNeedles(scoped, partnerNeedles)) {
    return "partner";
  }

  const myCustom = options.myName?.trim();
  if (myCustom && mentionsByNeedles(text, nameNeedles(myCustom))) {
    return "me";
  }

  if (mentionsByNeedles(text, meSynonymNeedles(locale))) {
    return "me";
  }

  return null;
}

export function normalizeOwnerDetectOptions(
  ctx: OwnerDetectOptions | string | null | undefined,
  locale: Locale,
): OwnerDetectOptions {
  if (typeof ctx === "string") {
    return { partnerName: ctx, locale };
  }
  if (!ctx) return { locale };
  return { ...ctx, locale: ctx.locale ?? locale };
}

export function applyDetectedOwner<T extends { owner?: BudgetOwner }>(
  data: T,
  transcript: string,
  opts: OwnerDetectOptions | string | null | undefined,
  fallbackOwner: BudgetOwner,
  legacyLocale?: Locale,
): T & { owner: BudgetOwner } {
  const detectOpts: OwnerDetectOptions =
    typeof opts === "string" || opts === null || opts === undefined
      ? { partnerName: opts, locale: legacyLocale ?? "ru" }
      : opts;
  const detected = detectOwnerFromTranscript(transcript, detectOpts);
  if (detected) return { ...data, owner: detected };
  if (data.owner === "me" || data.owner === "partner") {
    return { ...data, owner: data.owner };
  }
  return { ...data, owner: fallbackOwner };
}

export function applyDetectedOwnersWithCarry<T extends { owner?: BudgetOwner }>(
  items: readonly T[],
  clauses: readonly string[],
  opts: OwnerDetectOptions | string | null | undefined,
  fallbackOwner: BudgetOwner,
): (T & { owner: BudgetOwner })[] {
  let currentExplicitOwner: BudgetOwner | null = null;

  return items.map((item, index) => {
    const clause = clauses[index]?.trim() || "";
    const detected = detectOwnerFromTranscript(clause, opts);
    if (detected) {
      currentExplicitOwner = detected;
      return { ...item, owner: detected };
    }
    if (currentExplicitOwner) {
      return { ...item, owner: currentExplicitOwner };
    }
    if (item.owner === "me" || item.owner === "partner") {
      return { ...item, owner: item.owner };
    }
    return { ...item, owner: fallbackOwner };
  });
}
