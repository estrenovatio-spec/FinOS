import { decisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
import { resolveExpectedExpenseIdentity } from "@/lib/expected-events";
import { getFallbackCategoryId } from "@/lib/categories";
import { getLocalTodayIsoDate, isoDateToLocalMiddayMs } from "@/lib/format-date";
import type { ForecastEvent } from "@/lib/decision-core/types";
import type { ParsedTransaction, Transaction } from "@/types";
import type { DebtItem, RecurringTransaction } from "@/types/planning";

const PAYMENT_MARKERS = [
  "оплатил",
  "заплатил",
  "внес",
  "внёс",
  "внести",
  "погасил",
  "погашение",
  "ипотека",
  "кредит",
  "долг",
  "жкх",
  "аренда",
  "подписка",
] as const;

const STOP_WORDS = new Set([
  "оплатил",
  "оплатила",
  "оплатить",
  "заплатил",
  "заплатила",
  "заплатить",
  "внес",
  "внесла",
  "внести",
  "внёс",
  "внесение",
  "платеж",
  "платёж",
  "платежа",
  "платежи",
  "платежей",
  "взнос",
  "по",
  "за",
  "на",
  "уже",
  "сегодня",
  "вчера",
  "завтра",
]) as Set<string>;

export type ExpectedPaymentCandidate = {
  id: string;
  title: string;
  amount: number;
  date: string;
  originalDate: string;
  source: "debt_payment" | "pending_transaction" | "recurring";
  paymentSource: "debt" | "recurring" | "manual";
  debtId: string | null;
  transactionId: string | null;
  recurringId: string | null;
  linkedEntityId: string | null;
  categoryId: string;
  owner: "me" | "partner";
  isOverdue: boolean;
  stableKey: string;
};

export type ExpectedPaymentMatchConfidence = "high" | "medium" | "low";

export type ExpectedPaymentMatchResult =
  | { kind: "none" }
  | {
      kind: "single";
      confidence: ExpectedPaymentMatchConfidence;
      candidate: ExpectedPaymentCandidate;
      candidates: ExpectedPaymentCandidate[];
      enteredAmount: number | null;
      expectedAmount: number;
      amountMismatch: boolean;
    }
  | {
      kind: "multiple";
      confidence: "medium";
      candidates: ExpectedPaymentCandidate[];
      enteredAmount: number | null;
    };

type MatcherArgs = {
  state: DecisionCoreState;
  input: string;
  parsed?: ParsedTransaction | null;
  today?: string;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(word: string): string {
  if (word.length < 5) return word;
  return word
    .replace(/(иями|ями|ами|иях|ях|ах)$/u, "")
    .replace(/(ого|ему|ому|ыми|ими|его)$/u, "")
    .replace(/(ой|ий|ый|ое|ее|ую|юю|ом|ем)$/u, "")
    .replace(/(а|я|у|ю|е|ы|и)$/u, "");
}

export function normalizePaymentTitle(value: string): string {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word && !STOP_WORDS.has(word))
    .map(stemToken)
    .join(" ");
}

function extractInputTokens(value: string): string[] {
  return normalizePaymentTitle(value)
    .split(" ")
    .filter((word) => word.length >= 2);
}

function hasPaymentMarker(value: string): boolean {
  const normalized = normalizeText(value);
  return PAYMENT_MARKERS.some((marker) => normalized.includes(marker));
}

function dateDistanceInDays(left: string, right: string): number {
  const leftMs = isoDateToLocalMiddayMs(left);
  const rightMs = isoDateToLocalMiddayMs(right);
  if (leftMs == null || rightMs == null) return 999;
  return Math.round((leftMs - rightMs) / (24 * 60 * 60 * 1000));
}

function buildExpectedPaymentCandidates(state: DecisionCoreState, today: string): ExpectedPaymentCandidate[] {
  const snapshot = decisionCoreSnapshot({
    ...state,
    today,
  });
  const pendingById = new Map(
    state.transactions
      .filter((tx) => tx.type === "expense" && tx.confirmed === false)
      .map((tx) => [tx.id, tx] as const),
  );
  const recurringById = new Map(state.recurringTransactions.map((item) => [item.id, item] as const));
  const debtById = new Map(state.debts.map((item) => [item.id, item] as const));
  const deduped = new Map<string, ExpectedPaymentCandidate>();

  for (const event of snapshot.forecast.events) {
    if (event.amount >= 0) continue;
    if (
      event.source !== "debt_payment" &&
      event.source !== "pending_transaction" &&
      event.source !== "recurring"
    ) {
      continue;
    }

    const originalDate = event.plannedDate ?? event.date;
    const distance = dateDistanceInDays(originalDate, today);
    if (distance > 7) continue;
    if (distance < -1) continue;

    const identity = resolveExpectedExpenseIdentity(
      {
        amount: Math.abs(event.amount),
        date: originalDate,
        title: event.title,
        debtId: event.debtId ?? null,
        paymentSource: event.paymentSource,
        linkedEntityId: event.linkedEntityId ?? null,
        source: event.source === "debt_payment" || event.source === "pending_transaction" ? event.source : undefined,
      },
      state.debts,
    );
    const pendingTx = event.source === "pending_transaction" ? pendingById.get(event.id) ?? null : null;
    const recurringItem =
      event.source === "recurring"
        ? (event.recurringId ? recurringById.get(event.recurringId) ?? null : null)
        : pendingTx?.recurringId
          ? recurringById.get(pendingTx.recurringId) ?? null
          : null;
    const debtItem = identity.canonicalDebtId ? debtById.get(identity.canonicalDebtId) ?? null : null;
    const paymentSource =
      identity.canonicalDebtId
        ? ("debt" as const)
        : (event.paymentSource ?? (recurringItem ? "recurring" : "manual"));
    const candidate: ExpectedPaymentCandidate = {
      id: identity.stableKey,
      title: debtItem?.name?.trim() || recurringItem?.note?.trim() || pendingTx?.note?.trim() || event.title,
      amount: Math.abs(event.amount),
      date: event.date,
      originalDate,
      source: event.source,
      paymentSource,
      debtId: identity.canonicalDebtId,
      transactionId: pendingTx?.id ?? null,
      recurringId: recurringItem?.id ?? event.recurringId ?? null,
      linkedEntityId:
        identity.canonicalDebtId ??
        recurringItem?.id ??
        pendingTx?.recurringId ??
        event.linkedEntityId ??
        null,
      categoryId:
        pendingTx?.categoryId ??
        recurringItem?.categoryId ??
        (identity.canonicalDebtId ? "banking" : getFallbackCategoryId("expense")),
      owner:
        pendingTx?.owner ??
        (recurringItem?.owner === "partner" ? "partner" : "me"),
      isOverdue: originalDate < today,
      stableKey: identity.stableKey,
    };

    const existing = deduped.get(candidate.stableKey);
    if (!existing || (existing.source !== "debt_payment" && candidate.source === "debt_payment")) {
      deduped.set(candidate.stableKey, candidate);
    }
  }

  return [...deduped.values()].sort((left, right) => {
    const leftDelta = Math.abs(dateDistanceInDays(left.originalDate, today));
    const rightDelta = Math.abs(dateDistanceInDays(right.originalDate, today));
    if (leftDelta !== rightDelta) return leftDelta - rightDelta;
    if (left.amount !== right.amount) return right.amount - left.amount;
    return left.title.localeCompare(right.title, "ru");
  });
}

export function scoreExpectedPaymentCandidate(args: {
  input: string;
  enteredAmount: number | null;
  candidate: ExpectedPaymentCandidate;
  today: string;
}): number {
  const inputTokens = extractInputTokens(args.input);
  const candidateTokens = extractInputTokens(args.candidate.title);
  const overlapCount = inputTokens.filter((token) => candidateTokens.includes(token)).length;
  const titleScore =
    inputTokens.length === 0
      ? 0
      : Math.round((overlapCount / Math.max(inputTokens.length, candidateTokens.length || 1)) * 45);
  const exactTitleBonus =
    normalizePaymentTitle(args.input) &&
    normalizePaymentTitle(args.input) === normalizePaymentTitle(args.candidate.title)
      ? 20
      : 0;

  let amountScore = 0;
  if (args.enteredAmount != null) {
    if (Math.round(args.enteredAmount) === Math.round(args.candidate.amount)) {
      amountScore = 35;
    } else {
      const delta = Math.abs(args.enteredAmount - args.candidate.amount);
      const ratio = delta / Math.max(args.candidate.amount, 1);
      if (ratio <= 0.05) amountScore = 18;
      else if (ratio <= 0.15) amountScore = 8;
    }
  }

  const dayDistance = dateDistanceInDays(args.candidate.originalDate, args.today);
  let dateScore = 0;
  if (dayDistance === 0) dateScore = 25;
  else if (dayDistance < 0) dateScore = 22;
  else if (dayDistance === 1) dateScore = 16;
  else if (dayDistance <= 7) dateScore = 8;

  const paymentMarkerBonus = hasPaymentMarker(args.input) ? 12 : 0;
  const debtMarkerBonus =
    args.candidate.paymentSource === "debt" && /ипотек|кредит|долг|жкх|банкрот/u.test(normalizeText(args.input))
      ? 8
      : 0;

  return titleScore + exactTitleBonus + amountScore + dateScore + paymentMarkerBonus + debtMarkerBonus;
}

function resolveConfidence(sorted: Array<{ candidate: ExpectedPaymentCandidate; score: number }>, enteredAmount: number | null): ExpectedPaymentMatchResult {
  const best = sorted[0];
  if (!best || best.score < 32) {
    return { kind: "none" };
  }
  const second = sorted[1];
  const close = sorted.filter((entry) => entry.score >= best.score - 14);
  const amountMismatch =
    enteredAmount != null && Math.round(enteredAmount) !== Math.round(best.candidate.amount);

  if (
    second &&
    Math.abs(best.score - second.score) <= 20 &&
    best.candidate.originalDate === second.candidate.originalDate &&
    best.candidate.amount === second.candidate.amount &&
    normalizePaymentTitle(best.candidate.title) !== normalizePaymentTitle(second.candidate.title)
  ) {
    return {
      kind: "multiple",
      confidence: "medium",
      candidates: [best.candidate, second.candidate],
      enteredAmount,
    };
  }

  if (close.length > 1 && best.score < 88) {
    return {
      kind: "multiple",
      confidence: "medium",
      candidates: close.map((entry) => entry.candidate),
      enteredAmount,
    };
  }

  const confidence: ExpectedPaymentMatchConfidence =
    best.score >= 75 ? "high" : best.score >= 48 ? "medium" : "low";

  if (confidence === "low") {
    return { kind: "none" };
  }

  return {
    kind: "single",
    confidence,
    candidate: best.candidate,
    candidates: close.map((entry) => entry.candidate),
    enteredAmount,
    expectedAmount: best.candidate.amount,
    amountMismatch,
  };
}

export function matchInputToExpectedPayments({
  state,
  input,
  parsed,
  today = getLocalTodayIsoDate(),
}: MatcherArgs): ExpectedPaymentMatchResult {
  const trimmedInput = input.trim();
  if (!trimmedInput) return { kind: "none" };
  if (parsed && parsed.type !== "expense") return { kind: "none" };

  const enteredAmount =
    parsed?.amount && parsed.amount > 0
      ? parsed.amount
      : null;

  const candidates = buildExpectedPaymentCandidates(state, today);
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreExpectedPaymentCandidate({
        input: trimmedInput,
        enteredAmount,
        candidate,
        today,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  if (enteredAmount == null && !hasPaymentMarker(trimmedInput)) {
    const strongTitleMatch = scored[0];
    if (!strongTitleMatch || strongTitleMatch.score < 55) {
      return { kind: "none" };
    }
  }

  return resolveConfidence(scored, enteredAmount);
}

export function buildSyntheticPaymentTransaction(
  candidate: ExpectedPaymentCandidate,
  input: string,
  amountOverride?: number | null,
): ParsedTransaction {
  return {
    amount: amountOverride && amountOverride > 0 ? amountOverride : candidate.amount,
    type: "expense",
    categoryId: candidate.categoryId,
    currency: "RUB",
    note: input.trim() || candidate.title,
    date: candidate.originalDate,
    owner: candidate.owner,
    confirmed: true,
    recurringId: candidate.recurringId,
  };
}

export function buildMatcherState(state: {
  locale: DecisionCoreState["locale"];
  today?: string;
  forecastHorizonMonths: DecisionCoreState["forecastHorizonMonths"];
  categories: DecisionCoreState["categories"];
  transactions: Transaction[];
  householdFilter: DecisionCoreState["householdFilter"];
  recurringTransactions: RecurringTransaction[];
  debts: DebtItem[];
  moneySetup: DecisionCoreState["moneySetup"];
  categoryBudgets: DecisionCoreState["categoryBudgets"];
  budgetMonthStartDay: number;
  balances: DecisionCoreState["balances"];
}): DecisionCoreState {
  return {
    locale: state.locale,
    today: state.today ?? getLocalTodayIsoDate(),
    forecastHorizonMonths: state.forecastHorizonMonths,
    categories: state.categories,
    transactions: state.transactions,
    householdFilter: state.householdFilter,
    recurringTransactions: state.recurringTransactions,
    debts: state.debts,
    moneySetup: state.moneySetup,
    categoryBudgets: state.categoryBudgets,
    budgetMonthStartDay: state.budgetMonthStartDay,
    balances: state.balances,
  };
}
