"use client";

import { ChevronLeft, ChevronRight, Goal, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatHumanDateLong,
  formatIsoDate,
  formatTransactionDate,
  formatTransactionDateShort,
  formatWeekdayShort,
  getLocalTodayIsoDate,
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
import type { Locale } from "@/types";
import type { SavingsGoal } from "@/types/planning";

const WEEKDAY_LABELS: Record<Locale, string[]> = {
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

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

export function ForecastCalendarView({
  locale,
  forecast,
  startDate,
  goals,
  explanation,
  onOpenPlan,
}: {
  locale: Locale;
  forecast: BalanceForecast;
  startDate: string;
  goals: SavingsGoal[];
  explanation?: DecisionConstraintExplanation | null;
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
    const firstMeaningfulDay =
      month.days.find((day) => day.isCurrentMonth && (day.hasEvents || day.goals.length > 0)) ??
      month.days.find((day) => day.isCurrentMonth) ??
      null;
    setSelectedDate(firstMeaningfulDay?.date ?? null);
  }, [month]);

  const selectedDay = selectedDate ? daysByDate.get(selectedDate) ?? null : null;
  const selectedGoals = selectedDate ? goalMap.get(selectedDate) ?? [] : [];

  const selectedEvent = selectedDay?.events[0] ?? null;
  const planLink = (() => {
    if (selectedGoals[0]) {
      return { section: "goals" as const, entityId: selectedGoals[0].id };
    }
    if (!selectedEvent) return { section: "recurring" as const, entityId: null };
    if (selectedEvent.source === "essential_budget") {
      return {
        section: "limits" as const,
        entityId: selectedEvent.budgetReserveItems?.[0]?.categoryId ?? null,
      };
    }
    if (selectedEvent.source === "debt_payment") {
      return { section: "debts" as const, entityId: null };
    }
    if (selectedEvent.source === "recurring") {
      return { section: "recurring" as const, entityId: selectedEvent.recurringId ?? null };
    }
    if (selectedEvent.source === "income_source") {
      return { section: "recurring" as const, entityId: selectedEvent.incomeSourceId ?? null };
    }
    return { section: "recurring" as const, entityId: null };
  })();

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
              onClick={() => setMonthIndex((value) => Math.max(0, value - 1))}
              disabled={monthIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setMonthIndex((value) => Math.min(months.length - 1, value + 1))}
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

          <div className="hidden grid-cols-7 gap-2 md:grid">
            {WEEKDAY_LABELS[locale].map((label) => (
              <p key={label} className="px-1 text-xs font-medium text-muted-foreground">
                {label}
              </p>
            ))}
            {month.days.map((day) =>
              day.isCurrentMonth ? (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDate(day.date)}
                  className={[
                    "min-h-[112px] rounded-xl border p-2 text-left transition-colors",
                    selectedDate === day.date
                      ? "border-primary bg-primary/10 ring-1 ring-primary/25"
                      : "border-border/70 bg-background/80 hover:bg-muted/40",
                    day.isDeficit ? "border-rose-300" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-foreground">{day.dayNumber}</span>
                      <p className="text-[11px] text-muted-foreground">
                        {formatWeekdayShort(day.date, locale)}
                      </p>
                    </div>
                    {day.isDeficit ? <TriangleAlert className="h-4 w-4 text-rose-600" /> : null}
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    {day.incomeTotal > 0 ? (
                      <p className="font-medium text-emerald-600">+{formatMoney(day.incomeTotal, locale)} ₽</p>
                    ) : null}
                    {day.expenseTotal > 0 ? (
                      <p className="font-medium text-rose-600">−{formatMoney(day.expenseTotal, locale)} ₽</p>
                    ) : null}
                    {day.endBalance != null ? (
                      <p className="text-muted-foreground">
                        {locale === "ru" ? "После дня:" : "After day:"} {formatMoney(day.endBalance, locale)} ₽
                      </p>
                    ) : null}
                    {day.goals.length > 0 ? (
                      <p className="flex items-center gap-1 text-sky-600">
                        <Goal className="h-3.5 w-3.5" />
                        {day.goals.length}
                      </p>
                    ) : null}
                  </div>
                </button>
              ) : (
                <div key={day.date} aria-hidden className="min-h-[112px] rounded-xl bg-transparent" />
              ),
            )}
          </div>

          <div className="space-y-2 md:hidden">
            {month.days
              .filter((day) => day.isCurrentMonth && (day.hasEvents || day.goals.length > 0))
              .map((day) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDate(day.date)}
                  className={[
                    "w-full rounded-xl border p-3 text-left transition-colors",
                    selectedDate === day.date
                      ? "border-primary bg-primary/10 ring-1 ring-primary/25"
                      : "border-border/70 bg-background/80",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="text-xl font-semibold leading-none text-foreground">
                          {day.dayNumber}
                        </p>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            {formatWeekdayShort(day.date, locale)}
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {formatTransactionDateShort(day.date, locale)}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {day.eventsCount > 0
                          ? locale === "ru"
                            ? `${day.eventsCount} движений`
                            : `${day.eventsCount} money events`
                          : locale === "ru"
                            ? "Без движений"
                            : "No movement"}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      {day.incomeTotal > 0 ? (
                        <p className="font-medium text-emerald-600">+{formatMoney(day.incomeTotal, locale)} ₽</p>
                      ) : null}
                      {day.expenseTotal > 0 ? (
                        <p className="font-medium text-rose-600">−{formatMoney(day.expenseTotal, locale)} ₽</p>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>

        {selectedDate ? (
          <div className="space-y-3 rounded-xl border border-primary/20 bg-background/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-foreground">
                  {formatHumanDateLong(selectedDate, locale)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locale === "ru"
                    ? selectedDate === todayIso
                      ? "Сегодня"
                      : "Что произойдёт с деньгами в этот день"
                    : selectedDate === todayIso
                      ? "Today"
                      : "What happens to your money on this day"}
                </p>
              </div>
              {selectedDay?.endBalance != null ? (
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatMoney(selectedDay.endBalance, locale)} ₽
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {locale === "ru" ? "Баланс после дня" : "Balance after the day"}
                  </p>
                </div>
              ) : null}
            </div>

            {selectedGoals.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                  {locale === "ru" ? "Цели" : "Goals"}
                </p>
                {selectedGoals.map((goal) => (
                  <div key={goal.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-foreground">{goal.name}</span>
                    <span className="text-muted-foreground">
                      {locale === "ru" ? "Срок" : "Due"} {formatIsoDate(goal.deadline ?? "", locale)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedDay ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                    <p className="text-xs text-muted-foreground">
                      {locale === "ru" ? "Сколько было утром" : "Start of day"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatMoney(selectedDay.startBalance, locale)} ₽
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                    <p className="text-xs text-muted-foreground">
                      {locale === "ru" ? "Сколько останется после дня" : "End of day"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatMoney(selectedDay.endBalance, locale)} ₽
                    </p>
                  </div>
                </div>

                {(() => {
                  const grouped = groupEventsForDay(selectedDay.events);
                  const sections = [
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

                  return (
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
                                    <p className="mt-1 truncate text-sm font-medium text-foreground">
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
                                  <p className={["text-sm font-semibold", income ? "text-emerald-600" : "text-rose-600"].join(" ")}>
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
                  );
                })()}

                {explanation?.date === selectedDate ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <p className="text-sm font-semibold text-foreground">{explanation.title}</p>
                    <p className="mt-1 text-sm text-foreground">{explanation.summary}</p>
                    {explanation.detail ? (
                      <p className="mt-1 text-xs leading-snug text-muted-foreground">{explanation.detail}</p>
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
              onClick={() => onOpenPlan?.(planLink)}
            >
              {locale === "ru" ? "Изменить план" : "Edit plan"}
            </button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
