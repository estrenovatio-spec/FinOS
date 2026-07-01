import type { Locale } from "@/types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

const MONTH_SHORT_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
] as const;

const MONTH_SHORT_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_LONG_EN = [
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

function parseIsoDateParts(dateStr: string): { y: number; mo: number; d: number } | null {
  const m = ISO_DATE.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

/** YYYY-MM-DD → locale display */
export function formatIsoDate(dateStr: string, locale: Locale = "ru"): string {
  const parts = parseIsoDateParts(dateStr);
  if (!parts) return dateStr.trim();
  const { y, mo, d } = parts;
  const padMo = String(mo).padStart(2, "0");
  const padD = String(d).padStart(2, "0");
  if (locale === "en") return `${padMo}/${padD}/${y}`;
  return `${padD}.${padMo}.${y}`;
}

export function formatIsoPeriod(from: string, to: string, locale: Locale = "ru"): string {
  return `${formatIsoDate(from, locale)} — ${formatIsoDate(to, locale)}`;
}

/** Дедлайн цели / планирование */
export function formatPlanningDeadline(iso: string, locale: Locale): string {
  return formatIsoDate(iso, locale);
}

/** «Май 2026» / «May 2026» — без зависимости от локали ОС в WebView */
export function formatMonthYearLong(dateIso: string, locale: Locale): string {
  const parts = parseIsoDateParts(dateIso);
  if (!parts) return dateIso;
  const { y, mo } = parts;
  if (locale === "en") {
    return `${MONTH_LONG_EN[mo - 1]} ${y}`;
  }
  const d = new Date(y, mo - 1, 15);
  return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

/** Короткая дата в строке операции: «12 мар» / «Mar 12». */
export function formatTransactionDateShort(dateStr: string, locale: Locale): string {
  const parts = parseIsoDateParts(dateStr);
  if (!parts) return formatTransactionDate(dateStr, locale);
  const { mo, d } = parts;
  if (locale === "en") return `${MONTH_SHORT_EN[mo - 1]} ${d}`;
  return `${d} ${MONTH_SHORT_RU[mo - 1]}`;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** ISO date (YYYY-MM-DD) or full ISO */
export function formatTransactionDate(dateStr: string, locale: Locale): string {
  const raw = dateStr.trim();
  if (!raw) return "";
  const parts = parseIsoDateParts(raw);
  if (parts) return formatIsoDate(raw, locale);
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return formatIsoDate(`${y}-${mo}-${day}`, locale);
}
