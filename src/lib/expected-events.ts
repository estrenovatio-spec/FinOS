import { advanceRecurringDate } from "@/lib/planning/analytics";
import {
  listConfiguredIncomeSources,
  type MoneySetup,
  type MoneySetupIncomeSource,
  type MoneySetupIncomeSourceStatus,
} from "@/lib/money-setup";
import type { Locale } from "@/types";

export type ExpectedIncomeEvent = {
  kind: "income";
  incomeSourceId: string;
  occurrenceDate: string;
  title: string;
  amount: number;
  status: Extract<MoneySetupIncomeSourceStatus, "scheduled" | "due_today" | "overdue_unconfirmed">;
};

export type ExpectedExpenseEvent = {
  kind: "expense";
  transactionId: string;
  title: string;
  amount: number;
  date: string;
};

export type ExpectedEvent = ExpectedIncomeEvent | ExpectedExpenseEvent;

export type ExpectedEventHistoryAction =
  | "confirmed"
  | "rescheduled"
  | "snoozed_until_tomorrow"
  | "cancelled";

export interface ExpectedEventHistoryEntry {
  id: string;
  eventKey: string;
  kind: ExpectedEvent["kind"];
  title: string;
  originalDate: string;
  action: ExpectedEventHistoryAction;
  resultingDate?: string | null;
  amount?: number | null;
  createdAt: string;
}

export interface ExpectedEventReminder {
  id: string;
  eventKey: string;
  kind: ExpectedEvent["kind"];
  title: string;
  amount: number;
  originalDate: string;
  remindOn: string;
  createdAt: string;
}

function stripLegacyFlag(source: MoneySetupIncomeSource & { isLegacy?: boolean }): MoneySetupIncomeSource {
  return {
    id: source.id,
    label: source.label,
    expectedDate: source.expectedDate,
    expectedAmount: source.expectedAmount,
    kind: source.kind,
    recurrence: source.recurrence,
    intervalMonths: source.intervalMonths,
    dayOfMonth: source.dayOfMonth,
    endDate: source.endDate,
    ...(source.isPrimary !== undefined ? { isPrimary: source.isPrimary } : {}),
  };
}

function rebuildLegacyFields(
  setup: MoneySetup,
  sources: MoneySetupIncomeSource[],
): MoneySetup {
  const primary =
    sources.find((item) => item.isPrimary) ??
    sources[0] ??
    null;
  return {
    ...setup,
    incomeSources: sources,
    nextIncomeDate: primary?.expectedDate ?? null,
    expectedIncomeAmount: primary?.expectedAmount ?? null,
  };
}

export function materializeIncomeSources(
  setup: MoneySetup,
  locale: Locale = "ru",
): MoneySetupIncomeSource[] {
  return listConfiguredIncomeSources(setup, locale).map(stripLegacyFlag);
}

export function upsertIncomeSourceInSetup(
  setup: MoneySetup,
  nextSource: MoneySetupIncomeSource,
  locale: Locale = "ru",
): MoneySetup {
  const sources = materializeIncomeSources(setup, locale);
  const existingIndex = sources.findIndex((item) => item.id === nextSource.id);
  const nextSources =
    existingIndex === -1
      ? [...sources, nextSource]
      : sources.map((item, index) => (index === existingIndex ? nextSource : item));
  return rebuildLegacyFields(setup, nextSources);
}

export function removeIncomeSourceFromSetup(
  setup: MoneySetup,
  incomeSourceId: string,
  locale: Locale = "ru",
): MoneySetup {
  const nextSources = materializeIncomeSources(setup, locale).filter(
    (item) => item.id !== incomeSourceId,
  );
  return rebuildLegacyFields(setup, nextSources);
}

export function rescheduleIncomeSourceInSetup(
  setup: MoneySetup,
  incomeSourceId: string,
  newDate: string,
  locale: Locale = "ru",
): MoneySetup {
  const sources = materializeIncomeSources(setup, locale);
  const source = sources.find((item) => item.id === incomeSourceId);
  if (!source) return setup;
  const nextDayOfMonth =
    source.recurrence === "monthly"
      ? (source.dayOfMonth ??
        (source.expectedDate
          ? (Number.parseInt(source.expectedDate.slice(8, 10), 10) || null)
          : null))
      : (Number.parseInt(newDate.slice(8, 10), 10) || source.dayOfMonth);
  return rebuildLegacyFields(
    setup,
    sources.map((item) =>
      item.id === incomeSourceId
        ? {
            ...item,
            expectedDate: newDate,
            dayOfMonth: nextDayOfMonth,
          }
        : item,
    ),
  );
}

export function cancelIncomeOccurrenceInSetup(
  setup: MoneySetup,
  incomeSourceId: string,
  occurrenceDate: string,
  locale: Locale = "ru",
): MoneySetup {
  const sources = materializeIncomeSources(setup, locale);
  const source = sources.find((item) => item.id === incomeSourceId);
  if (!source) return setup;

  const recurrence = source.recurrence ?? "monthly";
  if (recurrence !== "monthly") {
    return removeIncomeSourceFromSetup(setup, incomeSourceId, locale);
  }

  const intervalMonths = Math.max(1, source.intervalMonths ?? 1);
  const dayOfMonth =
    source.dayOfMonth ??
    (Number.parseInt(occurrenceDate.slice(8, 10), 10) || 1);
  const nextDate = advanceRecurringDate(
    occurrenceDate,
    "monthly",
    dayOfMonth,
    intervalMonths,
  );

  return rebuildLegacyFields(
    setup,
    sources.map((item) =>
      item.id === incomeSourceId
        ? {
            ...item,
            expectedDate: nextDate,
            dayOfMonth,
          }
        : item,
    ),
  );
}

export function expectedEventDate(event: ExpectedEvent): string {
  return event.kind === "income" ? event.occurrenceDate : event.date;
}

export function expectedEventKey(event: ExpectedEvent): string {
  return event.kind === "income"
    ? `income:${event.incomeSourceId}:${event.occurrenceDate}`
    : `expense:${event.transactionId}:${event.date}`;
}

export function nextLocalIsoDate(dateIso: string): string {
  const base = new Date(`${dateIso}T12:00:00`);
  base.setDate(base.getDate() + 1);
  return base.toISOString().slice(0, 10);
}

export function shouldSuggestRecurringAmountUpdate(
  expectedAmount: number,
  actualAmount: number,
): boolean {
  const expected = Math.abs(expectedAmount);
  const actual = Math.abs(actualAmount);
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected <= 0) {
    return false;
  }
  return Math.abs(actual - expected) / expected > 0.1;
}
