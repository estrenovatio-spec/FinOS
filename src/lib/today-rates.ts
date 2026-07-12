import type { MarketRates } from "@/lib/market-rates";

export type TodayRatesRow = {
  code: "USD" | "EUR" | "CNY";
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

function formatRate(value: number, locale: "ru" | "en"): string {
  return value.toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

export function isValidMarketRate(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function buildTodayRatesView(input: {
  locale: "ru" | "en";
  rates: MarketRates | null;
  loading: boolean;
  hasError: boolean;
}): TodayRatesView {
  const { locale, rates, loading, hasError } = input;

  const rows: TodayRatesRow[] = rates
    ? ([
        { code: "USD", rate: rates.usdRub },
        { code: "EUR", rate: rates.eurRub },
        { code: "CNY", rate: rates.cnyRub },
      ] as const)
        .filter((item) => isValidMarketRate(item.rate))
        .map((item) => ({
          code: item.code,
          label: `1 ${item.code}`,
          value: `${formatRate(item.rate, locale)} ${locale === "ru" ? "₽" : "RUB"}`,
        }))
    : [];

  const updatedTime = rates ? formatUpdatedAt(rates.updatedAt, locale) : null;

  return {
    title: locale === "ru" ? "Курсы валют" : "Exchange rates",
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
          ? "Курсы временно недоступны."
          : "Rates are temporarily unavailable."
        : rates?.stale
          ? locale === "ru"
            ? "Курсы временно не обновляются. Показаны последние сохранённые значения."
            : "Rates are temporarily not updating. Showing the last saved values."
          : null,
    isLoading: loading && rows.length === 0,
    isError: hasError && rows.length === 0,
  };
}
