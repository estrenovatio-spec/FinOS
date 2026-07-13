import type { MarketRates } from "@/lib/market-rates";

export type TodayRatesRow = {
  code: "USD" | "EUR" | "MOEX" | "BTC";
  label: string;
  value: string;
};

export type TodayRatesView = {
  title: string;
  rows: TodayRatesRow[];
  updatedLabel: string | null;
  note: string | null;
  isLoading: boolean;
  isError: boolean;
};

function formatNumber(
  value: number,
  locale: "ru" | "en",
  digits: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {},
): string {
  return value.toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: digits.minimumFractionDigits ?? 0,
    maximumFractionDigits: digits.maximumFractionDigits ?? 2,
  });
}

function formatUpdatedAt(value: string, locale: "ru" | "en"): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isValidMarketRate(value: number | undefined): value is number {
  return Number.isFinite(value) && Number(value) > 0;
}

export function buildTodayRatesView(input: {
  locale: "ru" | "en";
  rates: MarketRates | null;
  loading: boolean;
  hasError: boolean;
}): TodayRatesView {
  const { locale, rates, loading, hasError } = input;

  const rows: TodayRatesRow[] = [];
  if (rates && isValidMarketRate(rates.usdRub)) {
    rows.push({
      code: "USD",
      label: "USD/RUB",
      value: `${formatNumber(rates.usdRub, locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${locale === "ru" ? "₽" : "RUB"}`,
    });
  }
  if (rates && isValidMarketRate(rates.eurRub)) {
    rows.push({
      code: "EUR",
      label: "EUR/RUB",
      value: `${formatNumber(rates.eurRub, locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${locale === "ru" ? "₽" : "RUB"}`,
    });
  }
  if (rates && isValidMarketRate(rates.moexIndex)) {
    rows.push({
      code: "MOEX",
      label: locale === "ru" ? "Мосбиржа" : "MOEX",
      value: formatNumber(rates.moexIndex, locale, { maximumFractionDigits: 0 }),
    });
  }
  if (rates && isValidMarketRate(rates.btcUsd)) {
    rows.push({
      code: "BTC",
      label: "Bitcoin",
      value: `$${formatNumber(rates.btcUsd, locale, { maximumFractionDigits: 0 })}`,
    });
  }

  const updatedTime = rates ? formatUpdatedAt(rates.updatedAt, locale) : null;

  return {
    title: locale === "ru" ? "Рынки" : "Markets",
    rows,
    updatedLabel:
      updatedTime == null
        ? null
        : locale === "ru"
          ? `Обновлено в ${updatedTime}`
          : `Updated at ${updatedTime}`,
    note:
      hasError && rows.length === 0
        ? locale === "ru"
          ? "Рыночные данные временно недоступны."
          : "Market data is temporarily unavailable."
        : rates?.stale
          ? locale === "ru"
            ? "Данные могут быть устаревшими. Показаны последние сохранённые значения."
            : "Data may be stale. Showing the last saved values."
          : null,
    isLoading: loading && rows.length === 0,
    isError: hasError && rows.length === 0,
  };
}
