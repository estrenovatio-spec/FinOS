import type { CategoryDefinition } from "@/types";
import type { RecurringTransaction } from "@/types/planning";

export interface MoneySetup {
  nextIncomeDate: string | null;
  expectedIncomeAmount: number | null;
  useHouseholdBalance: boolean;
  requiredRecurringIds: string[];
  essentialCategoryIds: string[];
  updatedAt: string | null;
}

export function emptyMoneySetup(): MoneySetup {
  return {
    nextIncomeDate: null,
    expectedIncomeAmount: null,
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
