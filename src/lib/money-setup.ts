import { extractIncomeSourceIdFromTransactionNote } from "@/lib/transaction-note";
import type { CategoryDefinition, Locale, Transaction } from "@/types";
import type { RecurringTransaction } from "@/types/planning";

export const MONEY_SETUP_INCOME_SOURCE_KINDS = [
  "salary",
  "advance",
  "rent",
  "freelance",
  "business",
  "passive",
  "other",
] as const;

export type MoneySetupIncomeSourceKind =
  (typeof MONEY_SETUP_INCOME_SOURCE_KINDS)[number];

export interface MoneySetupIncomeSource {
  id: string;
  label: string;
  expectedDate: string | null;
  expectedAmount: number | null;
  kind: MoneySetupIncomeSourceKind;
  isPrimary?: boolean;
}

export type MoneySetupIncomeSourceStatus =
  | "scheduled"
  | "due_today"
  | "received"
  | "overdue_unconfirmed";

export interface ResolvedMoneySetupIncomeSource extends MoneySetupIncomeSource {
  status: MoneySetupIncomeSourceStatus;
  matchedTransactionId: string | null;
  matchedTransactionDate: string | null;
  isLegacy?: boolean;
}

export interface MoneySetup {
  nextIncomeDate: string | null;
  expectedIncomeAmount: number | null;
  incomeSources: MoneySetupIncomeSource[];
  useHouseholdBalance: boolean;
  requiredRecurringIds: string[];
  hasNoRequiredFixedExpenses: boolean;
  essentialCategoryIds: string[];
  updatedAt: string | null;
}

export function emptyMoneySetup(): MoneySetup {
  return {
    nextIncomeDate: null,
    expectedIncomeAmount: null,
    incomeSources: [],
    useHouseholdBalance: false,
    requiredRecurringIds: [],
    hasNoRequiredFixedExpenses: false,
    essentialCategoryIds: [],
    updatedAt: null,
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
      ),
  ];
}

function normalizeMoneySetupIncomeSource(
  value: unknown,
): MoneySetupIncomeSource | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Partial<MoneySetupIncomeSource>;
  const id = typeof source.id === "string" ? source.id.trim() : "";
  const label = typeof source.label === "string" ? source.label.trim() : "";
  if (!id || !label) return null;

  const expectedAmount =
    source.expectedAmount == null || Number.isNaN(Number(source.expectedAmount))
      ? null
      : Number(source.expectedAmount);
  const kind = MONEY_SETUP_INCOME_SOURCE_KINDS.includes(
    source.kind as MoneySetupIncomeSourceKind,
  )
    ? (source.kind as MoneySetupIncomeSourceKind)
    : "other";

  return {
    id,
    label,
    expectedDate:
      typeof source.expectedDate === "string" && source.expectedDate.trim()
        ? source.expectedDate
        : null,
    expectedAmount,
    kind,
    ...(typeof source.isPrimary === "boolean" ? { isPrimary: source.isPrimary } : {}),
  };
}

function asIncomeSources(value: unknown): MoneySetupIncomeSource[] {
  if (!Array.isArray(value)) return [];

  const deduped = new Map<string, MoneySetupIncomeSource>();
  for (const item of value) {
    const normalized = normalizeMoneySetupIncomeSource(item);
    if (!normalized) continue;
    deduped.set(normalized.id, normalized);
  }
  return [...deduped.values()];
}

export function normalizeMoneySetup(raw: unknown): MoneySetup {
  const empty = emptyMoneySetup();
  if (!raw || typeof raw !== "object") return empty;

  const setup = raw as Partial<MoneySetup>;
  const expectedIncomeAmount =
    setup.expectedIncomeAmount == null || Number.isNaN(Number(setup.expectedIncomeAmount))
      ? null
      : Number(setup.expectedIncomeAmount);

  return {
    nextIncomeDate:
      typeof setup.nextIncomeDate === "string" && setup.nextIncomeDate.trim()
        ? setup.nextIncomeDate
        : null,
    expectedIncomeAmount,
    incomeSources: asIncomeSources(setup.incomeSources),
    useHouseholdBalance: Boolean(setup.useHouseholdBalance),
    requiredRecurringIds: asStringArray(setup.requiredRecurringIds),
    hasNoRequiredFixedExpenses: Boolean(setup.hasNoRequiredFixedExpenses),
    essentialCategoryIds: asStringArray(setup.essentialCategoryIds),
    updatedAt:
      typeof setup.updatedAt === "string" && setup.updatedAt.trim()
        ? setup.updatedAt
        : null,
  };
}

export function pruneMoneySetupIds(
  setup: MoneySetup,
  recurringTransactions: RecurringTransaction[],
  categories: CategoryDefinition[],
): MoneySetup {
  const recurringIds = new Set(recurringTransactions.map((item) => item.id));
  const categoryIds = new Set(categories.map((item) => item.id));

  return {
    ...setup,
    requiredRecurringIds: setup.requiredRecurringIds.filter((id) => recurringIds.has(id)),
    hasNoRequiredFixedExpenses:
      setup.requiredRecurringIds.length > 0 ? false : setup.hasNoRequiredFixedExpenses,
    essentialCategoryIds: setup.essentialCategoryIds.filter((id) => categoryIds.has(id)),
  };
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

function hasTextOverlap(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftWords = new Set(normalizeText(left).split(" ").filter((word) => word.length >= 3));
  if (leftWords.size === 0) return false;
  return normalizeText(right)
    .split(" ")
    .filter((word) => word.length >= 3)
    .some((word) => leftWords.has(word));
}

function isoDay(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.slice(0, 10);
}

function dayDistance(from: string, to: string): number {
  const fromDate = new Date(`${from}T12:00:00`);
  const toDate = new Date(`${to}T12:00:00`);
  const diff = Math.abs(toDate.getTime() - fromDate.getTime());
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

function scoreIncomeMatch(
  source: MoneySetupIncomeSource,
  transaction: Transaction,
): number {
  const expectedDate = isoDay(source.expectedDate);
  const actualDate = isoDay(transaction.date);
  const expectedAmount = source.expectedAmount != null ? Math.round(source.expectedAmount) : null;
  if (!expectedDate || !actualDate || expectedAmount == null) return -1;
  if (transaction.type !== "income" || transaction.confirmed === false) return -1;
  if (Math.round(transaction.amount) !== expectedAmount) return -1;

  const distance = dayDistance(expectedDate, actualDate);
  const labelOverlap = hasTextOverlap(source.label, transaction.note);
  if (labelOverlap && distance <= 31) {
    return 200 - distance;
  }
  if (actualDate === expectedDate) return 120;
  if (distance <= 1) return 110 - distance;
  if (distance <= 3) return 100 - distance;
  if (actualDate > expectedDate && distance <= 7) return 80 - distance;
  if (actualDate < expectedDate && distance <= 3) return 70 - distance;
  return -1;
}

export function listConfiguredIncomeSources(
  setup: MoneySetup,
  locale: Locale = "ru",
): Array<MoneySetupIncomeSource & { isLegacy?: boolean }> {
  if (setup.incomeSources.length > 0) {
    return setup.incomeSources;
  }

  if (
    typeof setup.nextIncomeDate === "string" &&
    setup.nextIncomeDate.trim() &&
    setup.expectedIncomeAmount != null &&
    setup.expectedIncomeAmount > 0
  ) {
    return [
      {
        id: "legacy-primary-income",
        label: locale === "ru" ? "Основной доход" : "Primary income",
        expectedDate: setup.nextIncomeDate,
        expectedAmount: setup.expectedIncomeAmount,
        kind: "salary",
        isPrimary: true,
        isLegacy: true,
      },
    ];
  }

  return [];
}

export function resolveMoneySetupIncomeSources(args: {
  moneySetup: MoneySetup;
  confirmedTransactions: Transaction[];
  today: string;
  locale?: Locale;
}): ResolvedMoneySetupIncomeSource[] {
  const sources = listConfiguredIncomeSources(args.moneySetup, args.locale ?? "ru")
    .filter(
      (source) =>
        typeof source.expectedDate === "string" &&
        source.expectedDate.trim() &&
        source.expectedAmount != null &&
        source.expectedAmount > 0,
    )
    .sort((left, right) => {
      const leftDate = left.expectedDate ?? "";
      const rightDate = right.expectedDate ?? "";
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
      return left.id.localeCompare(right.id);
    });

  const confirmedIncome = args.confirmedTransactions
    .filter((transaction) => transaction.type === "income" && transaction.confirmed !== false)
    .sort((left, right) => {
      const leftDate = isoDay(left.date) ?? left.date;
      const rightDate = isoDay(right.date) ?? right.date;
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
      return left.id.localeCompare(right.id);
    });
  const usedTransactionIds = new Set<string>();

  return sources.map((source) => {
    let matchedTransaction: Transaction | null = null;
    let matchedScore = -1;

    for (const transaction of confirmedIncome) {
      if (usedTransactionIds.has(transaction.id)) continue;
      if (extractIncomeSourceIdFromTransactionNote(transaction.note) === source.id) {
        matchedTransaction = transaction;
        matchedScore = Number.MAX_SAFE_INTEGER;
        break;
      }
      const score = scoreIncomeMatch(source, transaction);
      if (score > matchedScore) {
        matchedScore = score;
        matchedTransaction = transaction;
      }
    }

    if (matchedTransaction) {
      usedTransactionIds.add(matchedTransaction.id);
      return {
        ...source,
        status: "received",
        matchedTransactionId: matchedTransaction.id,
        matchedTransactionDate: isoDay(matchedTransaction.date),
      };
    }

    const expectedDate = isoDay(source.expectedDate);
    const status =
      expectedDate == null
        ? "overdue_unconfirmed"
        : expectedDate > args.today
          ? "scheduled"
          : expectedDate === args.today
            ? "due_today"
            : "overdue_unconfirmed";

    return {
      ...source,
      status,
      matchedTransactionId: null,
      matchedTransactionDate: null,
    };
  });
}
