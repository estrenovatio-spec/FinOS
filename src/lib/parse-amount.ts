import { roundMoneyUp } from "@/lib/format-money";
import type { Locale } from "@/types";

function normalizeNumberToken(raw: string): number {
  let s = raw.trim().replace(/\s/g, "");

  if (!s) return NaN;

  // 1.000.000 or 100.000 (тысячные разделители точкой)
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return Number(s.replace(/\./g, ""));
  }
  // 1,000,000 or 100,000
  if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    return Number(s.replace(/,/g, ""));
  }

  // десятичная дробь: 100,50 или 99.9 (не 100.000)
  if (/,\d{1,2}$/.test(s)) {
    return parseFloat(s.replace(",", "."));
  }
  if (/\.\d{1,2}$/.test(s) && !/\.\d{3}$/.test(s)) {
    return parseFloat(s);
  }

  // 100.000 — одна группа из 3 цифр после точки
  if (/^\d+\.\d{3}$/.test(s)) {
    return Number(s.replace(".", ""));
  }

  return parseFloat(s.replace(",", "."));
}

function applyMultiplier(base: number, multiplier: number): number {
  if (!Number.isFinite(base)) return 0;
  return roundMoneyUp(base * multiplier);
}

const RU_WORD_ONES: Record<string, number> = {
  один: 1,
  одна: 1,
  одно: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
  шестьдесят: 60,
  семьдесят: 70,
  восемьдесят: 80,
  девяносто: 90,
  сто: 100,
  двести: 200,
  триста: 300,
  четыреста: 400,
  пятьсот: 500,
  шестьсот: 600,
  семьсот: 700,
  восемьсот: 800,
  девятьсот: 900,
};

/** «две тысячи», «пятьсот рублей» без цифр */
function parseRussianSpokenAmount(text: string): number {
  const lower = text.toLowerCase();
  const afterWord = String.raw`(?=\s|$|[^а-яёa-z0-9])`;

  const thousandRe = new RegExp(
    String.raw`(\d+|[а-яё]+)\s*(?:тысяч[а-яё]*|тысячи|тыс\.?)${afterWord}`,
    "i",
  );
  const thousandMatch = lower.match(thousandRe);
  if (thousandMatch?.[1]) {
    const token = thousandMatch[1].trim();
    const base = /^\d+$/.test(token)
      ? Number(token)
      : (RU_WORD_ONES[token] ?? 0);
    if (base > 0) return roundMoneyUp(base * 1000);
  }

  const millionRe = new RegExp(
    String.raw`(\d+|[а-яё]+)\s*(?:млн|миллион[а-яё]*)${afterWord}`,
    "i",
  );
  const millionMatch = lower.match(millionRe);
  if (millionMatch?.[1]) {
    const token = millionMatch[1].trim();
    const base = /^\d+$/.test(token)
      ? Number(token)
      : (RU_WORD_ONES[token] ?? 0);
    if (base > 0) return roundMoneyUp(base * 1_000_000);
  }

  const compound = lower.match(
    /(?:^|\s)((?:двадцать|тридцать|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто)\s+(?:один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять))(?:\s|$|[^а-яё])/i,
  );
  if (compound?.[1]) {
    const parts = compound[1].trim().split(/\s+/);
    const tens = RU_WORD_ONES[parts[0]] ?? 0;
    const ones = parts[1] ? (RU_WORD_ONES[parts[1]] ?? 0) : 0;
    if (tens + ones > 0) return roundMoneyUp(tens + ones);
  }

  const words = [...lower.matchAll(
    /(?:^|\s)(сто|двести|триста|четыреста|пятьсот|шестьсот|семьсот|восемьсот|девятьсот|двадцать|тридцать|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать|восемнадцать|девятнадцать|два|две|три|четыре|пять|шесть|семь|восемь|девять)(?=\s|$|[^а-яё])/gi,
  )];
  let maxWord = 0;
  for (const m of words) {
    const v = RU_WORD_ONES[m[1].toLowerCase()] ?? 0;
    if (v > maxWord) maxWord = v;
  }
  return maxWord > 0 ? roundMoneyUp(maxWord) : 0;
}

/**
 * Извлекает сумму из русской/английской речи и текста.
 * «100 тысяч» → 100000, «100.000» → 100000, «1,5 млн» → 1500000
 */
export function parseAmountFromTranscript(transcript: string, locale: Locale): number {
  const text = transcript.toLowerCase().replace(/−/g, "-");

  if (locale === "ru") {
    const spoken = parseRussianSpokenAmount(text);
    if (spoken > 0) return spoken;
  }

  // (?=...) вместо \b: в JS \b не работает после кириллицы («млн», «тысяч»)
  const afterWord = String.raw`(?=\s|$|[^а-яёa-z0-9])`;
  const patterns: { re: RegExp; mult: number }[] = [
    {
      re: new RegExp(String.raw`(\d[\d\s.,]*)\s*(?:млн|миллион[а-яё]*|million|mln)${afterWord}`, "i"),
      mult: 1_000_000,
    },
    {
      re: new RegExp(
        String.raw`(\d[\d\s.,]*)\s*(?:тысяч[а-яё]*|тысячи|тыс\.?|тыщ|thousand)${afterWord}`,
        "i",
      ),
      mult: 1_000,
    },
    { re: /(\d[\d\s.,]*)\s*[kк](?=\s|$|[^a-zа-яё0-9])/i, mult: 1_000 },
  ];

  for (const { re, mult } of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const base = normalizeNumberToken(m[1]);
      if (Number.isFinite(base) && base > 0) {
        return roundMoneyUp(applyMultiplier(base, mult));
      }
    }
  }

  // «сто тысяч» без цифр — пропускаем в MVP

  const numbers = [...text.matchAll(/\d[\d\s.,]*/g)]
    .map((m) => normalizeNumberToken(m[0]))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (numbers.length === 0) return 0;

  return roundMoneyUp(Math.max(...numbers));
}

/** Все суммы из фразы (для «зарплата 10000, 2000 на отпуск»). */
export function extractAllAmountsFromTranscript(transcript: string, locale: Locale): number[] {
  const text = transcript.toLowerCase().replace(/−/g, "-");
  const afterWord = String.raw`(?=\s|$|[^а-яёa-z0-9])`;
  const found: number[] = [];

  const patterns: { re: RegExp; mult: number }[] = [
    {
      re: new RegExp(String.raw`(\d[\d\s.,]*)\s*(?:млн|миллион[а-яё]*|million|mln)${afterWord}`, "gi"),
      mult: 1_000_000,
    },
    {
      re: new RegExp(
        String.raw`(\d[\d\s.,]*)\s*(?:тысяч[а-яё]*|тысячи|тыс\.?|тыщ|thousand)${afterWord}`,
        "gi",
      ),
      mult: 1_000,
    },
    { re: /(\d[\d\s.,]*)\s*[kк](?=\s|$|[^a-zа-яё0-9])/gi, mult: 1_000 },
  ];

  for (const { re, mult } of patterns) {
    for (const m of text.matchAll(re)) {
      if (!m[1]) continue;
      const base = normalizeNumberToken(m[1]);
      if (Number.isFinite(base) && base > 0) {
        found.push(roundMoneyUp(applyMultiplier(base, mult)));
      }
    }
  }

  const plain = [...text.matchAll(/\d[\d\s.,]*/g)]
    .map((m) => normalizeNumberToken(m[0]))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => roundMoneyUp(n));

  const unique = [...new Set([...found, ...plain])].sort((a, b) => b - a);
  return unique;
}

/** Если AI вернул 100, а в фразе «100 тысяч» — берём из фразы */
export function resolveTransactionAmount(
  transcript: string,
  aiAmount: number,
  locale: Locale,
): number {
  const fromSpeech = parseAmountFromTranscript(transcript, locale);
  if (fromSpeech <= 0) return aiAmount > 0 ? roundMoneyUp(aiAmount) : 0;
  if (aiAmount <= 0) return fromSpeech;

  const lower = transcript.toLowerCase();
  const hasMultiplier = /тысяч|тыс\.?|тыщ|млн|миллион|thousand|million|[kк](?=\s|$|[^a-zа-яё0-9])/i.test(
    lower,
  );
  const hasThousandSep = /\d{1,3}[.,]\d{3}\b/.test(transcript);

  if (hasMultiplier || hasThousandSep) {
    if (fromSpeech > aiAmount) return fromSpeech;
  }

  // AI часто возвращает 1.5 вместо 1_500_000 для «1,5 млн»
  if (fromSpeech >= 10_000 && aiAmount > 0 && aiAmount < fromSpeech / 100) {
    return fromSpeech;
  }

  if (Math.abs(fromSpeech - aiAmount) / Math.max(aiAmount, 1) < 0.01) {
    return aiAmount;
  }

  return roundMoneyUp(fromSpeech >= aiAmount ? fromSpeech : aiAmount);
}
