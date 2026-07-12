"use client";

import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatTransactionDate, normalizeIsoDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import {
  groupForecastEventsByDate,
  resolveForecastFocus,
  type ForecastFocus,
} from "@/lib/forecast-focus";
import type { BalanceForecast, ForecastEvent } from "@/lib/decision-core/types";
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
      return locale === "ru" ? "Доход" : "Income";
  }
}

function focusReasonText(focus: ForecastFocus, locale: Locale): string {
  switch (focus.reason) {
    case "current_deficit":
      return locale === "ru"
        ? "Дефицит уже начался. Ниже показано, как прогноз развивается дальше."
        : "The deficit has already started. The forecast below shows what happens next.";
    case "future_deficit":
      return locale === "ru"
        ? "Это дата, на которой прогноз уходит в минус."
        : "This is the date where the forecast turns negative.";
    case "reserve_required":
      return locale === "ru"
        ? "Это ближайшая дата, где запас денег становится критически малым."
        : "This is the nearest date where the cash buffer becomes critically small.";
  }
}

export function FocusedForecastCard({
  locale,
  forecast,
  focus,
}: {
  locale: Locale;
  forecast: BalanceForecast;
  focus: ForecastFocus | null;
}) {
  const groups = useMemo(() => groupForecastEventsByDate(forecast), [forecast]);
  const focusResolution = useMemo(
    () => resolveForecastFocus(forecast, focus),
    [focus, forecast],
  );
  const [manualSelectedDate, setManualSelectedDate] = useState<string | null>(null);
  const selectedDate = manualSelectedDate ?? focusResolution.selectedDate;
  const selectedGroup = useMemo(
    () => groups.find((group) => group.date === selectedDate) ?? null,
    [groups, selectedDate],
  );
  const selectedEventId = focusResolution.selectedEventId;
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

  const message = useMemo(() => {
    if (!focus) return null;
    if (focusResolution.outOfHorizon) {
      return locale === "ru"
        ? "Дата риска находится за пределами текущего прогноза."
        : "The risk date is outside the current forecast horizon.";
    }
    if (!focusResolution.selectedDate) {
      return locale === "ru"
        ? "Прогноз пока не содержит событий на нужную дату."
        : "The forecast does not have events for that date yet.";
    }
    if (!focusResolution.exactMatch) {
      return locale === "ru"
        ? `Точной точки на ${formatTransactionDate(focus.date, locale)} нет, поэтому показана ближайшая доступная дата.`
        : `There is no exact point for ${formatTransactionDate(focus.date, locale)}, so the nearest available date is shown.`;
    }
    return focusReasonText(focus, locale);
  }, [focus, focusResolution, locale]);

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
            {focus
              ? message
              : locale === "ru"
                ? "Здесь показана та же прогнозная линия, на которую опирается экран «Сегодня»."
                : "This uses the same forecast line that powers Today."}
          </p>
        </div>

        {forecast.events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
            {locale === "ru"
              ? "В текущем горизонте прогноза пока нет событий."
              : "There are no events on the current forecast horizon yet."}
          </div>
        ) : null}

        {focus && focusResolution.outOfHorizon ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
            {message}
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
                        ? "border-primary bg-primary/10"
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
              <div className="space-y-3 rounded-xl border border-border/70 bg-background/80 p-3">
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
            ) : forecast.events.length > 0 ? (
              <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    {locale === "ru"
                      ? "Дата фокуса не найдена, поэтому прогноз открыт в обычном режиме."
                      : "The focus date was not found, so the forecast opened in normal mode."}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
