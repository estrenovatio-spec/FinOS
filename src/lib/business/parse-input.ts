import type { BusinessUnit } from "@/lib/business/types";

export type BusinessParsedInput =
  | { kind: "tx"; type: "income" | "expense"; amount: number; note: string; unitId: string | null }
  | { kind: "cushion"; amount: number; unitId: string | null }
  | { kind: "family"; amount: number; unitId: string | null };

/** Ключевые слова без \\b — в JS границы слов не работают с кириллицей. */
const CUSHION_KW = [
  "в резерв бизнеса",
  "резерв бизнеса",
  "в бизнес резерв",
  "в подушку",
  "в резерв",
  "подушк",
  "cushion",
  "reserve",
];
const FAMILY_KW = [
  "перевод себе",
  "перевод в семью",
  "в семью",
  "в семье",
  "семейн",
  "family",
  "withdraw",
  "себе",
];
const INCOME_KW = ["доход", "приход", "получил", "заработ", "income", "earned", "received"];
const EXPENSE_KW = ["расход", "потрат", "оплат", "закуп", "expense", "spent", "paid", "трата"];

function hasKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    const k = kw.toLowerCase();
    if (k.includes(" ")) {
      if (lower.includes(k)) return true;
      continue;
    }
    let idx = 0;
    while ((idx = lower.indexOf(k, idx)) >= 0) {
      const before = idx > 0 ? lower[idx - 1] : " ";
      const after = idx + k.length < lower.length ? lower[idx + k.length] : " ";
      const isWordChar = (ch: string) => /[а-яёa-z0-9]/i.test(ch);
      if (!isWordChar(before) && !isWordChar(after)) return true;
      idx += k.length;
    }
  }
  return false;
}

/** Парсит сумму: 5000, 5 000, 5.000 (тыс.), 5,5 (копейки). */
export function parseMoneyAmount(text: string): number | null {
  const suffixMatch = text.match(/(\d[\d\s.,]*|\d)\s*([kк])(?=\s|$|[^a-zа-яё0-9])/i);
  if (suffixMatch?.[1]) {
    let raw = suffixMatch[1].replace(/\s/g, "");
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");

    if (lastComma >= 0 && lastDot >= 0) {
      const decSep = lastComma > lastDot ? "," : ".";
      const thouSep = decSep === "," ? "." : ",";
      raw = raw.replace(new RegExp(`\\${thouSep}`, "g"), "").replace(decSep, ".");
    } else if (lastComma >= 0) {
      raw = raw.replace(",", ".");
    }

    const scaled = Number(raw);
    if (Number.isFinite(scaled) && scaled > 0) return Math.round(scaled * 1000);
  }

  const m = text.match(/(\d[\d\s.,]+|\d+)/);
  if (!m) return null;
  let raw = m[1].replace(/\s/g, "");

  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) {
    const n = Number(raw.replace(/[.,]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    const decSep = lastComma > lastDot ? "," : ".";
    const thouSep = decSep === "," ? "." : ",";
    raw = raw.replace(new RegExp(`\\${thouSep}`, "g"), "").replace(decSep, ".");
  } else if (lastComma >= 0) {
    const after = raw.length - lastComma - 1;
    raw =
      after === 3 && /^\d{1,3},\d{3}$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", ".");
  } else if (lastDot >= 0) {
    const after = raw.length - lastDot - 1;
    raw =
      after === 3 && /^\d{1,3}\.\d{3}$/.test(raw) ? raw.replace(/\./g, "") : raw;
  }

  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function stripAmount(text: string): string {
  return text
    .replace(/(\d[\d\s.,]+|\d+)\s*([kк]|₽|руб\.?|rub)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Самое длинное совпадение имени бизнеса в тексте. */
export function matchBusinessUnit(
  text: string,
  units: Pick<BusinessUnit, "id" | "name">[],
  fallbackUnitId: string | null,
): string | null {
  const lower = text.toLowerCase();
  let best: { id: string; score: number } | null = null;

  for (const u of units) {
    const name = u.name.trim();
    if (name.length < 2) continue;
    const nl = name.toLowerCase();
    if (lower.includes(nl)) {
      const score = nl.length;
      if (!best || score > best.score) best = { id: u.id, score };
    }
  }

  return best?.id ?? fallbackUnitId;
}

function stripUnitNames(text: string, units: Pick<BusinessUnit, "id" | "name">[]): string {
  let note = text;
  const sorted = [...units].sort((a, b) => b.name.length - a.name.length);
  for (const u of sorted) {
    const name = u.name.trim();
    if (name.length < 2) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    note = note.replace(new RegExp(escaped, "gi"), " ").replace(/\s+/g, " ").trim();
  }
  return note;
}

function stripKeywords(text: string, keywords: string[]): string {
  let note = text;
  for (const kw of [...keywords].sort((a, b) => b.length - a.length)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    note = note.replace(new RegExp(escaped, "gi"), " ");
  }
  return note.replace(/\s+/g, " ").trim();
}

/** Разбор текста для бизнес-операций (превью). */
export function parseBusinessInput(
  text: string,
  units: Pick<BusinessUnit, "id" | "name">[],
  fallbackUnitId: string | null,
): BusinessParsedInput | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const amount = parseMoneyAmount(trimmed);
  if (!amount) return null;

  const unitId = matchBusinessUnit(trimmed, units, fallbackUnitId);
  const allKw = [...CUSHION_KW, ...FAMILY_KW, ...INCOME_KW, ...EXPENSE_KW];
  const note = stripUnitNames(stripKeywords(stripAmount(trimmed), allKw), units).slice(0, 120);

  if (hasKeyword(trimmed, CUSHION_KW)) return { kind: "cushion", amount, unitId };
  if (hasKeyword(trimmed, FAMILY_KW)) return { kind: "family", amount, unitId };

  const signIncome = /^\+\s*(\d|[\d\s.,])/.test(trimmed);
  const signExpense = /^[-−–]\s*(\d|[\d\s.,])/.test(trimmed);

  if (signIncome || hasKeyword(trimmed, INCOME_KW)) {
    return { kind: "tx", type: "income", amount, note: note || "Доход", unitId };
  }
  if (signExpense || hasKeyword(trimmed, EXPENSE_KW)) {
    return { kind: "tx", type: "expense", amount, note: note || "Расход", unitId };
  }

  return { kind: "tx", type: "expense", amount, note: note || "Расход", unitId };
}
