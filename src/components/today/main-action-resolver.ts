import type { AppTabId } from "@/lib/app-bottom-nav";
import type { DecisionMainActionCommand } from "@/lib/decision-core/types";
import type { ForecastFocus } from "@/lib/forecast-focus";
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
  openMoneySetup: (
    scope: "income" | "required_expenses" | "essential_budgets",
  ) => void;
  openQuickAdd: () => void;
  navigateToTab: (
    tab: AppTabId,
    options?: { forecastFocus?: ForecastFocus | null },
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
      return locale === "ru" ? "Отметить оплаченным" : "Mark as paid";
    case "open_money_setup":
      if (command.scope === "income") {
        return locale === "ru" ? "Добавить доход" : "Add income";
      }
      if (command.scope === "required_expenses") {
        return locale === "ru" ? "Добавить обязательства" : "Add obligations";
      }
      return locale === "ru"
        ? "Настроить важные траты"
        : "Set essential spending";
    case "open_forecast":
      return locale === "ru" ? "Открыть прогноз" : "Open forecast";
    case "open_recurring_operations":
      return locale === "ru"
        ? "Открыть регулярные операции"
        : "Open recurring operations";
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
    case "open_forecast":
      executor.navigateToTab("forecast", {
        forecastFocus: getForecastFocusFromCommand(command),
      });
      return { ok: true };
    case "open_recurring_operations":
      executor.navigateToTab("recurring");
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
