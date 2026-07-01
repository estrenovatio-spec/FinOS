import type { Locale } from "@/types";

/** Копейки вверх: 199,01 ₽ → 200 ₽ (только для положительных сумм операций). */
export function roundMoneyUp(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount);
}

/** Отображение суммы; отрицательный баланс показывается как −1 000 */
export function formatMoney(amount: number, locale: Locale = "ru"): string {
  if (!Number.isFinite(amount)) return "0";
  if (amount === 0) return "0";
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const rounded = negative ? Math.floor(abs) : Math.ceil(abs);
  const formatted = rounded.toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
  return negative ? `−${formatted}` : formatted;
}
