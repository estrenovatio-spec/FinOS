import type { MoneySetup } from "@/lib/money-setup";
import type { CategoryBudget } from "@/types/planning";
import type { Locale } from "@/types";

export type MoneySetupProgressItem = {
  id: "balance" | "income" | "essential_categories";
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
  categoryBudgets: CategoryBudget[];
  balances: {
    all: number;
    me: number;
    partner: number;
  };
};

export function buildMoneySetupProgress(
  input: MoneySetupProgressInput,
): MoneySetupProgress {
  const { locale, moneySetup, categoryBudgets, balances } = input;
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
      id: "essential_categories",
      label: locale === "ru" ? "Плановые расходы" : "Planned spending",
      done: categoryBudgets.some((item) => Number.isFinite(item.monthlyLimit) && item.monthlyLimit > 0),
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
