"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Goal, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatHumanDateLong,
  formatIsoDate,
  formatWeekdayShort,
  getLocalTodayIsoDate,
  normalizeIsoDate,
} from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { buildForecastCalendarMonths } from "@/lib/forecast-calendar";
import { getForecastDays } from "@/lib/decision-core/forecast-days";
import type {
  BalanceForecast,
  DecisionConstraintExplanation,
  ForecastDay,
  ForecastEvent,
} from "@/lib/decision-core/types";
import type { PlannedFreeMoneyView } from "@/lib/free-money";
import type { Locale } from "@/types";
import type { SavingsGoal } from "@/types/planning";

function sourceLabel(source: ForecastEvent["source"], locale: Locale): string {
  switch (source) {
    case "pending_transaction":
      return locale === "ru" ? "Ожидается" : "Expected";
    case "recurring":
      return locale === "ru" ? "Регулярный платёж" : "Recurring payment";
    case "debt_payment":
      return locale === "ru" ? "Платёж по долгу" : "Debt payment";
    case "income_source":
      return locale === "ru" ? "Ожидается" : "Expected";
    case "confirmed_transaction":
      return locale === "ru" ? "Деньги уже пришли" : "Already received";
    case "essential_budget":
      return locale === "ru" ? "Плановые повседневные траты" : "Planned everyday spending";
  }
}

function plannedIncomeStateLabel(event: ForecastEvent, locale: Locale): string | null {
  if (event.source !== "income_source") return null;
  switch (event.plannedIncomeStatus) {
    case "scheduled":
      return locale === "ru" ? "Ожидается" : "Expected";
    case "due_today":
      return locale === "ru" ? "Ожидается сегодня" : "Expected today";
    case "overdue_unconfirmed":
      return locale === "ru" ? "Ещё не пришло" : "Still not received";
    default:
      return null;
  }
}

function eventAccent(event: ForecastEvent, locale: Locale): { badge: string; label: string; tone: string } {
  if (event.source === "income_source") {
    if (event.plannedIncomeStatus === "overdue_unconfirmed") {
      return {
        badge: "🟠",
        label: locale === "ru" ? "Ещё не пришло" : "Still not received",
        tone: "text-amber-700",
      };
    }
    return {
      badge: "🟡",
      label:
        event.plannedIncomeStatus === "due_today"
          ? locale === "ru"
            ? "Ожидается сегодня"
            : "Expected today"
          : locale === "ru"
            ? "Ожидается"
            : "Expected",
      tone: "text-amber-700",
    };
  }

  if (event.source === "confirmed_transaction" && event.amount > 0) {
    return {
      badge: "🟢",
      label: locale === "ru" ? "Доход" : "Income",
      tone: "text-emerald-700",
    };
  }

  if (event.source === "essential_budget") {
    return {
      badge: "🟡",
      label: locale === "ru" ? "План на день" : "Planned spending",
      tone: "text-amber-700",
    };
  }

  return event.amount > 0
    ? {
        badge: "🟢",
        label: locale === "ru" ? "Доход" : "Income",
        tone: "text-emerald-700",
      }
    : {
        badge: event.source === "debt_payment" ? "🔴" : "🔴",
        label: locale === "ru" ? "Платёж" : "Payment",
        tone: "text-rose-700",
      };
}

function groupEventsForDay(events: ForecastEvent[]) {
  return {
    incomes: events.filter((event) => event.amount > 0 && event.source !== "income_source"),
    expected: events.filter((event) => event.source === "income_source"),
    expenses: events.filter((event) => event.amount < 0),
  };
}

type CalendarSelectionStateArgs = {
  currentSelectedDate: string | null;
  monthDays: Array<{ date: string; isCurrentMonth: boolean; hasEvents: boolean; goals: Array<unknown> }>;
  hasUserSelectedDate: boolean;
};

export function selectCalendarDay(current: string | null, tappedDate: string): string {
  const normalized = normalizeIsoDate(tappedDate) ?? tappedDate;
  return normalized;
}

export function resolveCalendarSelectionState({
  currentSelectedDate,
  monthDays,
  hasUserSelectedDate,
}: CalendarSelectionStateArgs): string | null {
  const visibleMonthDays = monthDays.filter((day) => day.isCurrentMonth);
  const firstMeaningfulDay =
    visibleMonthDays.find((day) => day.hasEvents || day.goals.length > 0)?.date ??
    visibleMonthDays[0]?.date ??
    null;

  if (!firstMeaningfulDay) return null;

  if (
    hasUserSelectedDate &&
    currentSelectedDate &&
    visibleMonthDays.some((day) => day.date === currentSelectedDate)
  ) {
    return currentSelectedDate;
  }

  return firstMeaningfulDay;
}

function resolveDisplayedEndBalance(args: {
  date: string;
  forecastDay: ForecastDay | null;
  periodFreeMoney?: PlannedFreeMoneyView;
}): number | null {
  if (
    args.periodFreeMoney?.amount != null &&
    args.periodFreeMoney.periodEndDate != null &&
    args.periodFreeMoney.periodEndDate === args.date
  ) {
    return args.periodFreeMoney.amount;
  }
  return args.forecastDay?.endBalance ?? null;
}

export function ForecastCalendarView({
  locale,
  forecast,
  startDate,
  goals,
  explanation,
  periodFreeMoney,
  onOpenPlan,
}: {
  locale: Locale;
  forecast: BalanceForecast;
  startDate: string;
  goals: SavingsGoal[];
  explanation?: DecisionConstraintExplanation | null;
  periodFreeMoney?: PlannedFreeMoneyView;
  onOpenPlan?: (params: { section: "recurring" | "limits" | "debts" | "goals"; entityId?: string | null }) => void;
}) {
  const months = useMemo(
    () =>
      buildForecastCalendarMonths({
        forecast,
        startDate,
        locale,
        goals: goals
          .filter((goal) => Boolean(goal.deadline))
          .map((goal) => ({
            id: goal.id,
            name: goal.name,
            deadline: goal.deadline as string,
          })),
      }),
    [forecast, goals, locale, startDate],
  );
  const daysByDate = useMemo(
    () => new Map<string, ForecastDay>(getForecastDays(forecast).map((day) => [day.date, day])),
    [forecast],
  );
  const goalMap = useMemo(() => {
    const map = new Map<string, SavingsGoal[]>();
    for (const goal of goals) {
      if (!goal.deadline) continue;
      const existing = map.get(goal.deadline);
      if (existing) existing.push(goal);
      else map.set(goal.deadline, [goal]);
    }
    return map;
  }, [goals]);

  const [monthIndex, setMonthIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hasUserSelectedDate, setHasUserSelectedDate] = useState(false);

  useEffect(() => {
    setMonthIndex(0);
  }, [months.length]);

  const month = months[monthIndex] ?? null;
  const todayIso = getLocalTodayIsoDate();

  useEffect(() => {
    if (!month) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate((currentSelectedDate) =>
      resolveCalendarSelectionState({
        currentSelectedDate,
        monthDays: month.days,
        hasUserSelectedDate,
      }),
    );
  }, [hasUserSelectedDate, month]);

  if (!month) {
    return (
      <Card className="border-primary/20 bg-primary/5 shadow-none">
        <CardContent className="p-4 text-sm text-muted-foreground">
          {locale === "ru"
            ? "В выбранном горизонте пока нет месяцев для календаря."
            : "There are no calendar months on the selected horizon yet."}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {locale === "ru" ? "Календарь денег" : "Money calendar"}
            </p>
            <p className="text-xs text-muted-foreground">
              {locale === "ru"
                ? "Здесь видно, что будет происходить с деньгами в ближайшие дни."
                : "See what will happen to your money over the next days."}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => {
                setHasUserSelectedDate(false);
                setMonthIndex((value) => Math.max(0, value - 1));
              }}
              disabled={monthIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => {
                setHasUserSelectedDate(false);
                setMonthIndex((value) => Math.min(months.length - 1, value + 1));
              }}
              disabled={monthIndex >= months.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-base font-semibold text-foreground">{month.label}</p>
            <p className="text-xs text-muted-foreground">
              {locale === "ru" ? "< Листайте по месяцам >" : "< Browse months >"}
            </p>
          </div>
          <div className="space-y-2">
            {month.days
              .filter((day) => day.isCurrentMonth && (day.hasEvents || day.goals.length > 0))
              .map((day) => {
                const isOpen = selectedDate === day.date;
                const forecastDay = daysByDate.get(day.date) ?? null;
                const displayedEndBalance = resolveDisplayedEndBalance({
                  date: day.date,
                  forecastDay,
                  periodFreeMoney,
                });
                const dayGoals = goalMap.get(day.date) ?? [];
                const grouped = forecastDay ? groupEventsForDay(forecastDay.events) : null;
                const sections =
                  grouped == null
                    ? []
                    : [
                        {
                          key: "expected",
                          title: locale === "ru" ? "Ожидается" : "Expected",
                          events: grouped.expected,
                        },
                        {
                          key: "income",
                          title: locale === "ru" ? "Доходы" : "Income",
                          events: grouped.incomes,
                        },
                        {
                          key: "expense",
                          title: locale === "ru" ? "Расходы" : "Expenses",
                          events: grouped.expenses,
                        },
                      ].filter((section) => section.events.length > 0);

                const inlinePlanLink = (() => {
                  if (dayGoals[0]) {
                    return { section: "goals" as const, entityId: dayGoals[0].id };
                  }
                  const firstEvent = forecastDay?.events[0] ?? null;
                  if (!firstEvent) return { section: "recurring" as const, entityId: null };
                  if (firstEvent.source === "essential_budget") {
                    return {
                      section: "limits" as const,
                      entityId: firstEvent.budgetReserveItems?.[0]?.categoryId ?? null,
                    };
                  }
                  if (firstEvent.source === "debt_payment") {
                    return { section: "debts" as const, entityId: null };
                  }
                  if (firstEvent.source === "recurring") {
                    return { section: "recurring" as const, entityId: firstEvent.recurringId ?? null };
                  }
                  if (firstEvent.source === "income_source") {
                    return { section: "recurring" as const, entityId: firstEvent.incomeSourceId ?? null };
                  }
                  return { section: "recurring" as const, entityId: null };
                })();

                return (
                  <div
                    key={day.date}
                    className={[
                      "overflow-hidden rounded-2xl border bg-background/80 transition-colors",
                      isOpen ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border/70",
                      day.isDeficit ? "border-rose-300" : "",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setHasUserSelectedDate(true);
                        setSelectedDate((current) => selectCalendarDay(current, day.date));
                      }}
                      className="w-full px-4 py-3 text-left"
                      aria-pressed={isOpen}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-start gap-3">
                            <div className="min-w-[3.25rem] text-center">
                              <p className="text-2xl font-semibold leading-none text-foreground">
                                {day.dayNumber}
                              </p>
                              <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                {formatWeekdayShort(day.date, locale)}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">
                                {formatHumanDateLong(day.date, locale)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {day.date === todayIso
                                  ? locale === "ru"
                                    ? "Сегодня"
                                    : "Today"
                                  : locale === "ru"
                                    ? `${day.eventsCount} движений по деньгам`
                                    : `${day.eventsCount} money events`}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="text-right text-xs">
                            {day.incomeTotal > 0 ? (
                              <p className="font-medium text-emerald-600">+{formatMoney(day.incomeTotal, locale)} ₽</p>
                            ) : null}
                            {day.expenseTotal > 0 ? (
                              <p className="font-medium text-rose-600">−{formatMoney(day.expenseTotal, locale)} ₽</p>
                            ) : null}
                            {displayedEndBalance != null ? (
                              <p className="mt-1 text-muted-foreground">
                                {locale === "ru" ? "В конце дня" : "End of day"}: {formatMoney(displayedEndBalance, locale)} ₽
                              </p>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex flex-col items-end gap-2">
                            {day.isDeficit ? <TriangleAlert className="h-4 w-4 text-rose-600" /> : null}
                            <ChevronDown
                              className={[
                                "h-4 w-4 text-muted-foreground transition-transform",
                                isOpen ? "rotate-180" : "",
                              ].join(" ")}
                            />
                          </div>
                        </div>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="space-y-3 border-t border-primary/10 px-4 py-4">
                        {dayGoals.length > 0 ? (
                          <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                              {locale === "ru" ? "Цели" : "Goals"}
                            </p>
                            {dayGoals.map((goal) => (
                              <div key={goal.id} className="flex items-center justify-between gap-3 text-sm">
                                <span className="min-w-0 truncate text-foreground">{goal.name}</span>
                                <span className="text-muted-foreground">
                                  {locale === "ru" ? "Срок" : "Due"} {formatIsoDate(goal.deadline ?? "", locale)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {forecastDay ? (
                          <>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                                <p className="text-xs text-muted-foreground">
                                  {locale === "ru" ? "Сколько было утром" : "Start of day"}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {formatMoney(forecastDay.startBalance, locale)} ₽
                                </p>
                              </div>
                              <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                                <p className="text-xs text-muted-foreground">
                                  {locale === "ru" ? "В конце дня" : "End of day"}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                  {formatMoney(displayedEndBalance ?? forecastDay.endBalance, locale)} ₽
                                </p>
                              </div>
                            </div>

                            <div className="space-y-3">
                              {sections.map((section) => (
                                <div key={section.key} className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    {section.title}
                                  </p>
                                  {section.events.map((event) => {
                                    const income = event.amount > 0;
                                    const accent = eventAccent(event, locale);
                                    return (
                                      <div key={event.id} className="rounded-lg border border-border/60 bg-background/70 p-3">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className={["text-xs font-medium", accent.tone].join(" ")}>
                                              {accent.badge} {accent.label}
                                            </p>
                                            <p className="mt-1 text-sm font-medium text-foreground">
                                              {event.title}
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                              {sourceLabel(event.source, locale)}
                                            </p>
                                            {plannedIncomeStateLabel(event, locale) ? (
                                              <p className="mt-0.5 text-xs text-muted-foreground">
                                                {plannedIncomeStateLabel(event, locale)}
                                              </p>
                                            ) : null}
                                          </div>
                                          <p
                                            className={[
                                              "text-sm font-semibold",
                                              income ? "text-emerald-600" : "text-rose-600",
                                            ].join(" ")}
                                          >
                                            {income ? "+" : "−"}
                                            {formatMoney(Math.abs(event.amount), locale)} ₽
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>

                            {explanation?.date === day.date ? (
                              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                                <p className="text-sm font-semibold text-foreground">{explanation.title}</p>
                                <p className="mt-1 text-sm text-foreground">{explanation.summary}</p>
                                {explanation.detail ? (
                                  <p className="mt-1 text-xs leading-snug text-muted-foreground">
                                    {explanation.detail}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
                            {locale === "ru"
                              ? "На эту дату пока ничего не запланировано."
                              : "Nothing is planned for this date yet."}
                          </div>
                        )}

                        <button
                          type="button"
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                          onClick={() => onOpenPlan?.(inlinePlanLink)}
                        >
                          {locale === "ru" ? "Изменить план" : "Edit plan"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
