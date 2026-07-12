"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatTransactionDate, normalizeIsoDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { buildFocusedForecastView } from "@/components/app/focused-forecast-presenter";
import {
  groupForecastEventsByDate,
  resolveForecastFocus,
  type ForecastFocus,
} from "@/lib/forecast-focus";
import type {
  BalanceForecast,
  DecisionConstraintExplanation,
  ForecastEvent,
} from "@/lib/decision-core/types";
import type { Locale } from "@/types";

function sourceLabel(source: ForecastEvent["source"], locale: Locale): string {
  switch (source) {
    case "pending_transaction":
      return locale === "ru" ? "Операция" : "Transaction";
    case "recurring":
      return locale === "ru" ? "Регулярное" : "Recurring";
    case "debt_payment":
      return locale === "ru" ? "Долг" : "Debt";
    case "income_source":
      return locale === "ru" ? "Ожидаемый доход" : "Expected income";
    case "confirmed_transaction":
      return locale === "ru" ? "Полученный доход" : "Received income";
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
      return locale === "ru" ? "Не подтверждён" : "Not confirmed";
    default:
      return null;
  }
}

export function FocusedForecastCard({
  locale,
  forecast,
  focus,
  explanation,
}: {
  locale: Locale;
  forecast: BalanceForecast;
  focus: ForecastFocus | null;
  explanation?: DecisionConstraintExplanation | null;
}) {
  const groups = useMemo(() => groupForecastEventsByDate(forecast), [forecast]);
  const focusResolution = useMemo(
    () => resolveForecastFocus(forecast, focus),
    [focus, forecast],
  );
  const view = useMemo(
    () => buildFocusedForecastView(forecast, focus, locale, explanation),
    [explanation, focus, forecast, locale],
  );
  const [manualSelectedDate, setManualSelectedDate] = useState<string | null>(null);
  const selectedDate = manualSelectedDate ?? view.selectedDate;
  const selectedGroup = useMemo(
    () => groups.find((group) => group.date === selectedDate) ?? null,
    [groups, selectedDate],
  );
  const selectedEventId = view.selectedEventId;
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const eventRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastAppliedFocusKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setManualSelectedDate(null);
  }, [focus?.date, focus?.reason]);

  useEffect(() => {
    const normalizedDate = normalizeIsoDate(focus?.date);
    const focusKey =
      focus && normalizedDate
        ? `${focus.reason}:${normalizedDate}:${focus.eventId ?? "none"}`
        : null;
    if (!focusKey || !selectedDate || lastAppliedFocusKeyRef.current === focusKey) {
      return;
    }
    lastAppliedFocusKeyRef.current = focusKey;
    rowRefs.current[selectedDate]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    if (selectedEventId) {
      window.requestAnimationFrame(() => {
        eventRefs.current[selectedEventId]?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    }
  }, [focus, selectedDate, selectedEventId]);

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">
              {locale === "ru" ? "Контекст прогноза" : "Forecast context"}
            </p>
          </div>
          <p className="text-xs leading-snug text-muted-foreground">
            {view.message ??
              (locale === "ru"
                ? "Здесь показана та же прогнозная линия, на которую опирается экран «Сегодня»."
                : "This uses the same forecast line that powers Today.")}
          </p>
        </div>

        {forecast.events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
            {locale === "ru"
              ? "В текущем горизонте прогноза пока нет событий."
              : "There are no events on the current forecast horizon yet."}
          </div>
        ) : null}

        {groups.length > 0 ? (
          <div className="space-y-2">
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {groups.map((group) => {
                const isSelected = group.date === selectedDate;
                return (
                  <Button
                    key={group.date}
                    ref={(element) => {
                      rowRefs.current[group.date] = element;
                    }}
                    type="button"
                    variant="outline"
                    className={[
                      "h-auto w-full justify-between rounded-xl border px-3 py-3 text-left",
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/25"
                        : "border-border/70 bg-background/70",
                    ].join(" ")}
                    onClick={() => setManualSelectedDate(group.date)}
                    aria-pressed={isSelected}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatTransactionDate(group.date, locale)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {locale === "ru"
                          ? `${group.events.length} событий`
                          : `${group.events.length} events`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {formatMoney(group.balanceAfter, locale)}{" "}
                        {locale === "ru" ? "₽" : "RUB"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {group.totalDelta >= 0 ? "+" : "−"}
                        {formatMoney(Math.abs(group.totalDelta), locale)}
                      </p>
                    </div>
                  </Button>
                );
              })}
            </div>

            {selectedGroup ? (
              <div className="space-y-3 rounded-xl border border-primary/20 bg-background/80 p-3">
                {focus ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">
                      {locale === "ru"
                        ? "Почему FIN OS привёл вас сюда"
                        : "Why FIN OS brought you here"}
                    </p>
                    {view.contextTitle ? (
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {view.contextTitle}
                      </p>
                    ) : null}
                    {view.contextSummary ? (
                      <p
                        className={[
                          "mt-1 text-sm font-medium",
                          explanation?.kind === "deficit" ? "text-rose-600" : "text-foreground",
                        ].join(" ")}
                      >
                        {view.contextSummary}
                      </p>
                    ) : view.contextBalance ? (
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {locale === "ru"
                          ? `Баланс после событий: ${view.contextBalance}`
                          : `Balance after events: ${view.contextBalance}`}
                      </p>
                    ) : null}
                    {view.contextDetail ? (
                      <p className="mt-1 text-xs leading-snug text-muted-foreground">
                        {view.contextDetail}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {formatTransactionDate(selectedGroup.date, locale)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {locale === "ru"
                        ? "Баланс после событий даты"
                        : "Balance after this date"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold text-foreground">
                      {formatMoney(selectedGroup.balanceAfter, locale)}{" "}
                      {locale === "ru" ? "₽" : "RUB"}
                    </p>
                    {selectedGroup.balanceAfter < 0 ? (
                      <p className="text-xs font-medium text-rose-600">
                        {locale === "ru"
                          ? `Дефицит ${formatMoney(Math.abs(selectedGroup.balanceAfter), locale)} ₽`
                          : `Deficit ${formatMoney(Math.abs(selectedGroup.balanceAfter), locale)} RUB`}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedGroup.events.map((event) => {
                    const isIncome = event.amount > 0;
                    const isFocusedEvent = event.id === selectedEventId;
                    return (
                      <div
                        key={event.id}
                        ref={(element) => {
                          eventRefs.current[event.id] = element;
                        }}
                        className={[
                          "rounded-lg border bg-background/70 p-3",
                          isFocusedEvent
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : "border-border/60",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
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
                            {isFocusedEvent ? (
                              <p className="mt-1 text-[11px] font-medium text-primary">
                                {locale === "ru"
                                  ? "Событие, которое привело вас из Today"
                                  : "The event that brought you from Today"}
                              </p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <p
                              className={[
                                "text-sm font-semibold",
                                isIncome ? "text-emerald-600" : "text-rose-600",
                              ].join(" ")}
                            >
                              {isIncome ? "+" : "−"}
                              {formatMoney(Math.abs(event.amount), locale)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatMoney(event.balanceAfter, locale)}{" "}
                              {locale === "ru" ? "₽" : "RUB"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                          {isIncome ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {locale === "ru"
                              ? "Баланс после события"
                              : "Balance after event"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
