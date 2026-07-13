import { formatMoney } from "@/lib/format-money";
import { findForecastDayByDate } from "@/lib/decision-core/forecast-days";
import { getForecastConfidence } from "@/lib/decision-core/forecast-confidence";
import { getConstraintPoint } from "@/lib/decision-core/constraint-point";
import type {
  DecisionConstraintExplanation,
  DecisionCoreContext,
  ForecastEvent,
} from "@/lib/decision-core/types";

const MONTHS_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatDayMonth(iso: string, locale: DecisionCoreContext["locale"]): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (locale === "en") return `${MONTHS_EN[monthIndex]} ${day}`;
  return `${day} ${MONTHS_RU[monthIndex]}`;
}

function normalizeAmount(amount: number): number {
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.000001) return 0;
  return amount;
}

function rub(amount: number, locale: DecisionCoreContext["locale"]): string {
  return `${formatMoney(normalizeAmount(amount), locale)} ${locale === "ru" ? "₽" : "RUB"}`;
}

function absoluteRub(amount: number, locale: DecisionCoreContext["locale"]): string {
  return `${formatMoney(Math.abs(normalizeAmount(amount)), locale)} ${locale === "ru" ? "₽" : "RUB"}`;
}

function eventVerb(event: ForecastEvent, locale: DecisionCoreContext["locale"]): string {
  if (locale === "en") {
    return event.amount > 0 ? "income" : "payment";
  }
  return event.amount > 0 ? "поступления" : "платежа";
}

function buildSingleEventSummary(
  event: ForecastEvent,
  balanceAfter: number,
  kind: "deficit" | "reserve",
  locale: DecisionCoreContext["locale"],
): string {
  if (event.source === "essential_budget") {
    if (kind === "deficit") {
      return locale === "ru"
        ? `К этой дате плановые повседневные траты на ${absoluteRub(event.amount, locale)} могут снизить баланс до ${rub(balanceAfter, locale)}.`
        : `By this date, planned everyday spending of ${absoluteRub(event.amount, locale)} can reduce the balance to ${rub(balanceAfter, locale)}.`;
    }

    return locale === "ru"
      ? `К этой дате на плановые повседневные траты потребуется ${absoluteRub(event.amount, locale)}, и останется ${rub(balanceAfter, locale)}.`
      : `By this date, ${absoluteRub(event.amount, locale)} is needed for planned everyday spending, leaving ${rub(balanceAfter, locale)}.`;
  }

  const base =
    locale === "ru"
      ? `После ${eventVerb(event, locale)} «${event.title}» на ${absoluteRub(event.amount, locale)}`
      : `After ${eventVerb(event, locale)} “${event.title}” for ${absoluteRub(event.amount, locale)}`;
  if (kind === "deficit") {
    return locale === "ru"
      ? `${base} баланс станет ${rub(balanceAfter, locale)}.`
      : `${base} the balance will become ${rub(balanceAfter, locale)}.`;
  }
  return locale === "ru"
    ? `${base} останется ${rub(balanceAfter, locale)}.`
    : `${base} ${rub(balanceAfter, locale)} will remain.`;
}

function buildMixedDaySummary(
  date: string,
  events: ForecastEvent[],
  balanceAfter: number,
  kind: "deficit" | "reserve",
  locale: DecisionCoreContext["locale"],
): string {
  const incomeTotal = events
    .filter((event) => event.amount > 0)
    .reduce((sum, event) => sum + event.amount, 0);
  const expenseTotal = Math.abs(
    events
      .filter((event) => event.amount < 0)
      .reduce((sum, event) => sum + event.amount, 0),
  );
  const firstSentence =
    locale === "ru"
      ? `${formatDayMonth(date, locale)} придёт ${absoluteRub(incomeTotal, locale)} и спишется ${absoluteRub(expenseTotal, locale)}.`
      : `On ${formatDayMonth(date, locale)} ${absoluteRub(incomeTotal, locale)} will come in and ${absoluteRub(expenseTotal, locale)} will go out.`;

  const secondSentence =
    kind === "deficit"
      ? locale === "ru"
        ? `После всех операций баланс станет ${rub(balanceAfter, locale)}.`
        : `After all operations the balance will become ${rub(balanceAfter, locale)}.`
      : locale === "ru"
        ? `После всех операций останется ${rub(balanceAfter, locale)}.`
        : `After all operations ${rub(balanceAfter, locale)} will remain.`;

  return `${firstSentence} ${secondSentence}`;
}

function buildMultiEventSummary(
  date: string,
  events: ForecastEvent[],
  balanceAfter: number,
  kind: "deficit" | "reserve",
  locale: DecisionCoreContext["locale"],
): string {
  const hasIncome = events.some((event) => event.amount > 0);
  const hasExpense = events.some((event) => event.amount < 0);
  if (hasIncome && hasExpense) {
    return buildMixedDaySummary(date, events, balanceAfter, kind, locale);
  }

  const absTotal = events.reduce((sum, event) => sum + Math.abs(event.amount), 0);
  const firstSentence =
    locale === "ru"
      ? `${formatDayMonth(date, locale)} пройдут ${events.length} платежа на ${absoluteRub(absTotal, locale)}.`
      : `${events.length} payments totaling ${absoluteRub(absTotal, locale)} will happen on ${formatDayMonth(date, locale)}.`;
  const secondSentence =
    kind === "deficit"
      ? locale === "ru"
        ? `После них баланс станет ${rub(balanceAfter, locale)}.`
        : `After them the balance will become ${rub(balanceAfter, locale)}.`
      : locale === "ru"
        ? `После них останется ${rub(balanceAfter, locale)}.`
        : `After them ${rub(balanceAfter, locale)} will remain.`;
  return `${firstSentence} ${secondSentence}`;
}

export function buildConstraintExplanation(
  ctx: DecisionCoreContext,
): DecisionConstraintExplanation | null {
  const point = getConstraintPoint(ctx);
  if (!point) return null;
  const confidence = getForecastConfidence(ctx, point.date);

  const day = findForecastDayByDate(ctx.forecast, point.date);
  const events = day?.events ?? [point.event];
  const balanceAfter = normalizeAmount(day?.endBalance ?? point.balanceAfter);
  const totalDelta = normalizeAmount(day?.netChange ?? point.eventAmount);
  const selectedEvent =
    events.find((event) => event.id === point.eventId) ?? (events.length === 1 ? events[0] : null);

  const title =
    point.kind === "deficit"
      ? ctx.locale === "ru"
        ? `${formatDayMonth(point.date, ctx.locale)} денег уже не хватит.`
        : `By ${formatDayMonth(point.date, ctx.locale)} the money will run short.`
      : ctx.locale === "ru"
        ? `Почему до ${formatDayMonth(point.date, ctx.locale)}?`
        : `Why until ${formatDayMonth(point.date, ctx.locale)}?`;

  const summary =
    selectedEvent && events.length === 1
      ? buildSingleEventSummary(selectedEvent, balanceAfter, point.kind, ctx.locale)
      : buildMultiEventSummary(point.date, events, balanceAfter, point.kind, ctx.locale);

  const detail =
    point.kind === "deficit"
      ? confidence.note
      : [ctx.locale === "ru" ? "Эти деньги уже распределены на будущие базовые траты." : "That money is already spread across future essential spending.", confidence.note]
          .filter(Boolean)
          .join(" ");

  return {
    date: point.date,
    kind: point.kind,
    title,
    summary,
    detail,
    eventId: selectedEvent?.id ?? null,
    eventTitle: selectedEvent?.title ?? null,
    eventAmount: selectedEvent?.amount ?? null,
    balanceAfter,
    requiredFloor: point.requiredFloor,
    eventCount: events.length,
    totalDelta,
  };
}
