import type { MoneySetup } from "@/lib/money-setup";
import type { Locale } from "@/types";

export type MoneySetupProgressItem = {
  id: "balance" | "income" | "required_expenses" | "essential_categories";
  label: string;
  done: boolean;
};

export type MoneySetupProgress = {
  completed: number;
  total: number;
  title: string;
  summary: string;
  items: MoneySetupProgressItem[];
};

type MoneySetupProgressInput = {
  locale: Locale;
  moneySetup: MoneySetup;
  balances: {
    all: number;
    me: number;
    partner: number;
  };
};

export function buildMoneySetupProgress(
  input: MoneySetupProgressInput,
): MoneySetupProgress {
  const { locale, moneySetup, balances } = input;
  const currentBalance = moneySetup.useHouseholdBalance ? balances.all : balances.me;

  const items: MoneySetupProgressItem[] = [
    {
      id: "balance",
      label: locale === "ru" ? "Текущий остаток" : "Current balance",
      done: Number.isFinite(currentBalance) && currentBalance > 0,
    },
    {
      id: "income",
      label: locale === "ru" ? "Ближайший доход" : "Next income",
      done: Boolean(
        moneySetup.nextIncomeDate ||
          moneySetup.incomeSources.some((source) => source.expectedDate),
      ),
    },
    {
      id: "required_expenses",
      label: locale === "ru" ? "Обязательные платежи" : "Required payments",
      done:
        moneySetup.hasNoRequiredFixedExpenses ||
        moneySetup.requiredRecurringIds.length > 0,
    },
    {
      id: "essential_categories",
      label: locale === "ru" ? "Базовые траты" : "Essential spending",
      done: moneySetup.essentialCategoryIds.length > 0,
    },
  ];

  const completed = items.filter((item) => item.done).length;
  return {
    completed,
    total: items.length,
    title: locale === "ru" ? "Финансовая база" : "Financial base",
    summary:
      locale === "ru"
        ? `${completed} из ${items.length} заполнено`
        : `${completed} of ${items.length} completed`,
    items,
  };
}
