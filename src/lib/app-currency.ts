import type { Currency } from "@/types";

/** Все операции в приложении — только в рублях */
export const APP_CURRENCY: Currency = "RUB";

export function normalizeAppCurrency(_currency?: string | null): Currency {
  return APP_CURRENCY;
}
