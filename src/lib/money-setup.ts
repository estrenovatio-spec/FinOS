import type { CategoryDefinition } from "@/types";
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

export interface MoneySetup {
  nextIncomeDate: string | null;
  expectedIncomeAmount: number | null;
  incomeSources: MoneySetupIncomeSource[];
  useHouseholdBalance: boolean;
  requiredRecurringIds: string[];
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
    essentialCategoryIds: setup.essentialCategoryIds.filter((id) => categoryIds.has(id)),
  };
}
