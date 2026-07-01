import { parseMoneyAmount } from "@/lib/business/parse-input";

function cleanAmountText(text: string): string {
  return text
    .replace(/[₽р]/gi, " ")
    .replace(/\b(?:руб(?:\.|ля|лей|ль)?|rub)\b/gi, " ")
    .trim();
}

function looksLikeSingleFormattedAmount(parts: string[], separators: string[]): boolean {
  if (parts.length < 2) return true;
  if (parts.length === 2 && parts[1].length <= 2) {
    return separators.length === 1 && /^[,.]+$/.test(separators[0]);
  }
  return (
    parts.length >= 3 &&
    separators.length === parts.length - 1 &&
    parts[0].length <= 3 &&
    parts.slice(1).every((p) => p.length === 3)
  );
}

function parseSeparatedAmountSequence(sequence: string): number[] {
  const cleaned = cleanAmountText(sequence);
  if (!/^\d+(?:[\s,.]+\d+)+$/.test(cleaned)) return [];
  const separators = cleaned.match(/[\s,.]+/g) ?? [];
  const parts = cleaned.split(/[\s,.]+/).filter(Boolean);
  if (looksLikeSingleFormattedAmount(parts, separators)) return [];

  const amounts = parts
    .map((part) => parseMoneyAmount(part))
    .filter((amount): amount is number => amount != null && Number.isFinite(amount) && amount > 0);
  return amounts.length === parts.length && amounts.length > 1 ? amounts : [];
}

export function parseSeparatedMoneyAmounts(input: string): number[] {
  return parseSeparatedAmountSequence(input.trim());
}

export function extractSeparatedMoneyAmounts(input: string): number[] {
  const candidates = [...input.matchAll(/\d+(?:[\s,.]+\d+)+/g)]
    .map((match) => parseSeparatedAmountSequence(match[0]))
    .filter((amounts) => amounts.length > 1)
    .sort((a, b) => b.length - a.length);
  return candidates[0] ?? [];
}
