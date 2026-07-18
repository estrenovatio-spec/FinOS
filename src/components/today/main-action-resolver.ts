import type { AppTabId } from "@/lib/app-bottom-nav";
import type { DecisionMainActionCommand } from "@/lib/decision-core/types";
import type { ForecastFocus } from "@/lib/forecast-focus";
import type { PlanSection } from "@/lib/plan-navigation";
import type { Locale } from "@/types";

export type TodayActionExecutionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: "missing_entity" | "unsupported_command";
    };

export type TodayActionExecutor = {
  confirmPendingTransaction: (paymentId: string) => boolean;
  openIncomeConfirmation: (params: {
    incomeSourceId: string;
    incomeTitle: string;
    plannedDate: string;
    plannedAmount: number;
    status: "due_today" | "overdue_unconfirmed";
  }) => void;
  openMoneySetup: (
    scope: "balance" | "income" | "required_expenses" | "essential_budgets",
  ) => void;
  openQuickAdd: () => void;
  navigateToTab: (
    tab: AppTabId,
    options?: {
      forecastFocus?: ForecastFocus | null;
      planSection?: PlanSection;
      entityId?: string | null;
    },
  ) => void;
};

export function getForecastFocusFromCommand(
  command: DecisionMainActionCommand,
): ForecastFocus | null {
  if (command.type !== "open_forecast" || !command.focusDate || !command.reason) {
    return null;
  }

  return {
    date: command.focusDate,
    source: "today_main_action",
    reason: command.reason,
    eventId: command.eventId ?? null,
  };
}

export function getMainActionButtonLabel(
  command: DecisionMainActionCommand,
  locale: Locale,
): string | null {
  switch (command.type) {
    case "confirm_payment":
      return locale === "ru" ? "Оплатить" : "Pay";
    case "open_money_setup":
      if (command.scope === "balance") {
        return locale === "ru" ? "Указать остаток" : "Set balance";
      }
      if (command.scope === "income") {
        return locale === "ru" ? "Добавить доход" : "Add income";
      }
      if (command.scope === "required_expenses") {
        return locale === "ru" ? "Добавить обязательства" : "Add obligations";
      }
      return locale === "ru"
        ? "Настроить плановые расходы"
        : "Set planned spending";
    case "confirm_income_source":
      return locale === "ru" ? "Получил" : "Received";
    case "open_forecast":
      return locale === "ru" ? "Открыть прогноз" : "Open forecast";
    case "open_recurring_operations":
      return locale === "ru"
        ? "Открыть план"
        : "Open plan";
    case "add_transaction":
      return locale === "ru" ? "Добавить операцию" : "Add entry";
    case "none":
      return null;
  }
}

export async function executeMainActionCommand(
  command: DecisionMainActionCommand,
  executor: TodayActionExecutor,
): Promise<TodayActionExecutionResult> {
  switch (command.type) {
    case "confirm_payment":
      return executor.confirmPendingTransaction(command.paymentId)
        ? { ok: true }
        : { ok: false, error: "missing_entity" };
    case "open_money_setup":
      executor.openMoneySetup(command.scope);
      return { ok: true };
    case "confirm_income_source":
      executor.openIncomeConfirmation(command);
      return { ok: true };
    case "open_forecast":
      executor.navigateToTab("forecast", {
        forecastFocus: getForecastFocusFromCommand(command),
      });
      return { ok: true };
    case "open_recurring_operations":
      executor.navigateToTab("plan", {
        planSection: "recurring",
        entityId: command.recurringId ?? null,
      });
      return { ok: true };
    case "add_transaction":
      executor.openQuickAdd();
      return { ok: true };
    case "none":
      return { ok: true };
    default:
      return { ok: false, error: "unsupported_command" };
  }
}
