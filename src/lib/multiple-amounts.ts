import { parseMoneyAmount } from "@/lib/business/parse-input";

export type CompactMultiAmountInput = {
  label: string;
  amounts: number[];
};

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

function isStandaloneAmountToken(token: string): boolean {
  return /^\d[\d.,]*$/.test(token);
}

function looksLikeModelNumberSequence(
  labelTokens: string[],
  amounts: number[],
): boolean {
  return (
    labelTokens.length === 1 &&
    amounts.length === 2 &&
    amounts[0] <= 99 &&
    amounts[1] >= 10000
  );
}

function shouldSkipCandidateAsModelNumber(
  input: string,
  matchIndex: number,
  amounts: number[],
): boolean {
  if (!(amounts.length === 2 && amounts[0] <= 99 && amounts[1] >= 10000)) {
    return false;
  }

  const prefix = input.slice(0, matchIndex).trimEnd();
  if (!prefix) return false;
  return /[a-zа-яё]\s*$/i.test(prefix);
}

export function extractCompactMultiAmountInput(
  input: string,
): CompactMultiAmountInput | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/[,;\n\r]/.test(trimmed)) return null;
  if (/\s+(?:и|and)\s+/i.test(trimmed)) return null;

  const normalized = trimmed.replace(/\s+/g, " ");
  const tokens = normalized.split(" ");
  const firstAmountIndex = tokens.findIndex(isStandaloneAmountToken);
  if (firstAmountIndex <= 0) return null;

  const labelTokens = tokens.slice(0, firstAmountIndex);
  const amountTokens = tokens.slice(firstAmountIndex);
  if (amountTokens.length < 2 || !amountTokens.every(isStandaloneAmountToken)) {
    return null;
  }
  if (labelTokens.length > 3 || labelTokens.some((token) => /\d/.test(token))) {
    return null;
  }

  const amounts = amountTokens
    .map((token) => parseMoneyAmount(token))
    .filter(
      (amount): amount is number =>
        amount != null && Number.isFinite(amount) && amount > 0,
    );
  if (amounts.length !== amountTokens.length) return null;
  if (looksLikeModelNumberSequence(labelTokens, amounts)) return null;

  return {
    label: labelTokens.join(" ").trim(),
    amounts,
  };
}

export function parseSeparatedMoneyAmounts(input: string): number[] {
  return parseSeparatedAmountSequence(input.trim());
}

export function extractSeparatedMoneyAmounts(input: string): number[] {
  const compact = extractCompactMultiAmountInput(input);
  if (compact) return compact.amounts;

  const candidates = [...input.matchAll(/\d+(?:[\s,.]+\d+)+/g)]
    .map((match) => {
      const amounts = parseSeparatedAmountSequence(match[0]);
      const index = typeof match.index === "number" ? match.index : 0;
      return shouldSkipCandidateAsModelNumber(input, index, amounts) ? [] : amounts;
    })
    .filter((amounts) => amounts.length > 1)
    .sort((a, b) => b.length - a.length);
  return candidates[0] ?? [];
}
