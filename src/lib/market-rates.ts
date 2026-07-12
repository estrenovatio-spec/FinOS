export type MarketRates = {
  usdRub: number;
  eurRub: number;
  cnyRub: number;
  updatedAt: string;
  stale: boolean;
};

type CbrDailyJson = {
  Date?: string;
  Valute?: {
    USD?: { Value?: number; Nominal?: number };
    EUR?: { Value?: number; Nominal?: number };
    CNY?: { Value?: number; Nominal?: number };
  };
};

const CACHE_TTL_MS = 30 * 60 * 1000;

let cache: { data: MarketRates; at: number } | null = null;

function normalizeRate(entry: { Value?: number; Nominal?: number } | undefined): number {
  if (!entry) return Number.NaN;
  const value = Number(entry.Value);
  const nominal = Number(entry.Nominal);
  if (!Number.isFinite(value) || !Number.isFinite(nominal) || nominal <= 0) {
    return Number.NaN;
  }
  return value / nominal;
}

export function normalizeCbrMarketRates(json: CbrDailyJson): MarketRates {
  const usdRub = normalizeRate(json.Valute?.USD);
  const eurRub = normalizeRate(json.Valute?.EUR);
  const cnyRub = normalizeRate(json.Valute?.CNY);

  if (!Number.isFinite(usdRub) || !Number.isFinite(eurRub) || !Number.isFinite(cnyRub)) {
    throw new Error("CBR parse failed");
  }

  return {
    usdRub,
    eurRub,
    cnyRub,
    updatedAt:
      typeof json.Date === "string" && json.Date.trim()
        ? new Date(json.Date).toISOString()
        : new Date().toISOString(),
    stale: false,
  };
}

async function fetchCbrRates(): Promise<MarketRates> {
  const res = await fetch("https://www.cbr-xml-daily.ru/daily_json.js", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("CBR fetch failed");
  const json = (await res.json()) as CbrDailyJson;
  return normalizeCbrMarketRates(json);
}

export async function getMarketRates(): Promise<MarketRates> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const data = await fetchCbrRates();
    cache = { data, at: Date.now() };
    return data;
  } catch (error) {
    if (cache) {
      return {
        ...cache.data,
        stale: true,
      };
    }
    throw error;
  }
}

export function resetMarketRatesCacheForTests(): void {
  cache = null;
}

export function seedMarketRatesCacheForTests(
  data: MarketRates,
  ageMs = 0,
): void {
  cache = {
    data,
    at: Date.now() - ageMs,
  };
}
