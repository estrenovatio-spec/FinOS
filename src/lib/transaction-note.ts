import { isGarbageTranscript } from "@/lib/transcript-guard";

const INCOME_SOURCE_META_RE = /\n?\[\[finos:income-source:([a-zA-Z0-9_-]+)\]\]\s*$/;

function stripHiddenTransactionMetadata(note: string): string {
  return note.replace(INCOME_SOURCE_META_RE, "").trimEnd();
}

export function extractIncomeSourceIdFromTransactionNote(note: string): string | null {
  const match = note.match(INCOME_SOURCE_META_RE);
  return match?.[1] ?? null;
}

/** Note is only for extra context — not a duplicate of the amount on the right */
export function isAmountOnlyNote(note: string, amount: number): boolean {
  const n = stripHiddenTransactionMetadata(note).trim();
  if (!n) return true;

  const amt = Math.round(amount * 100) / 100;
  const asInt = Math.round(amt);
  if (n === String(amt) || n === String(asInt)) return true;

  const digits = n.replace(/[^\d.,]/g, "").replace(",", ".");
  const parsed = Number.parseFloat(digits);
  if (Number.isFinite(parsed) && Math.abs(parsed - amt) < 0.01) {
    const letters = n.replace(/[\d\s.,₽рубrub]/gi, "").trim();
    if (letters.length < 4) return true;
  }

  return false;
}

export function sanitizeTransactionNote(note: string, amount: number): string {
  const n = stripHiddenTransactionMetadata(note).trim();
  if (!n || isGarbageTranscript(n) || isAmountOnlyNote(n, amount)) return "";
  return n.slice(0, 120);
}

export function displayTransactionNote(note: string, amount: number): string | null {
  const clean = sanitizeTransactionNote(note, amount);
  return clean || null;
}

export function buildStoredTransactionNote(
  note: string,
  amount: number,
  incomeSourceId?: string | null,
): string {
  const visible = sanitizeTransactionNote(note, amount);
  const marker =
    typeof incomeSourceId === "string" && incomeSourceId.trim()
      ? `[[finos:income-source:${incomeSourceId.trim()}]]`
      : "";
  if (!marker) return visible;
  return visible ? `${visible}\n${marker}` : marker;
}

/** Комментарий при вводе + фраза/заметка от разбора. */
export function mergeTransactionComment(
  parsedNote: string | undefined,
  phrase: string,
  userComment: string,
  amount: number,
): string {
  const base = sanitizeTransactionNote(parsedNote?.trim() || phrase, amount);
  const extra = userComment.trim().slice(0, 120);
  if (!extra) return base;
  if (!base) return extra;
  if (base.includes(extra)) return base.slice(0, 120);
  return `${base} · ${extra}`.slice(0, 120);
}
