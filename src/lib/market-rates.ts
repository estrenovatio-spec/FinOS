export type MarketRates = {
  usdRub?: number;
  eurRub?: number;
  moexIndex?: number;
  btcUsd?: number;
  updatedAt: string;
  stale: boolean;
};

type CbrDailyJson = {
  Date?: string;
  Valute?: {
    USD?: { Value?: number; Nominal?: number };
    EUR?: { Value?: number; Nominal?: number };
  };
};

type MoexJson = {
  marketdata?: {
    columns?: string[];
    data?: unknown[][];
  };
};

type CoinGeckoJson = {
  bitcoin?: {
    usd?: number;
  };
};

const CACHE_TTL_MS = 15 * 60 * 1000;

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

function validPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function mergeSnapshots(parts: Array<Partial<MarketRates>>): MarketRates {
  return {
    ...parts.reduce<Partial<MarketRates>>((acc, part) => ({ ...acc, ...part }), {}),
    updatedAt: new Date().toISOString(),
    stale: false,
  };
}

function hasAnyRate(snapshot: MarketRates): boolean {
  return Boolean(
    validPositive(snapshot.usdRub) ||
      validPositive(snapshot.eurRub) ||
      validPositive(snapshot.moexIndex) ||
      validPositive(snapshot.btcUsd),
  );
}

export function normalizeCbrMarketRates(json: CbrDailyJson): Pick<MarketRates, "usdRub" | "eurRub"> {
  const usdRub = normalizeRate(json.Valute?.USD);
  const eurRub = normalizeRate(json.Valute?.EUR);

  if (!Number.isFinite(usdRub) || !Number.isFinite(eurRub)) {
    throw new Error("CBR parse failed");
  }

  return { usdRub, eurRub };
}

export function normalizeMoexMarketRates(json: MoexJson): Pick<MarketRates, "moexIndex"> {
  const columns = json.marketdata?.columns ?? [];
  const data = json.marketdata?.data ?? [];
  const secIdIndex = columns.indexOf("SECID");
  const lastIndex = columns.indexOf("LAST") >= 0 ? columns.indexOf("LAST") : columns.indexOf("CURRENTVALUE");
  if (secIdIndex < 0 || lastIndex < 0) {
    throw new Error("MOEX parse failed");
  }

  const row = data.find((item) => item[secIdIndex] === "IMOEX");
  const value = Number(row?.[lastIndex]);
  if (!validPositive(value)) throw new Error("MOEX value missing");
  return { moexIndex: value };
}

export function normalizeBitcoinMarketRates(
  json: CoinGeckoJson,
): Pick<MarketRates, "btcUsd"> {
  const value = Number(json.bitcoin?.usd);
  if (!validPositive(value)) throw new Error("BTC parse failed");
  return { btcUsd: value };
}

async function fetchCbrRates(): Promise<Pick<MarketRates, "usdRub" | "eurRub">> {
  const res = await fetch("https://www.cbr-xml-daily.ru/daily_json.js", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("CBR fetch failed");
  const json = (await res.json()) as CbrDailyJson;
  return normalizeCbrMarketRates(json);
}

async function fetchMoexIndex(): Promise<Pick<MarketRates, "moexIndex">> {
  const res = await fetch(
    "https://iss.moex.com/iss/engines/stock/markets/index/securities/IMOEX.json?iss.meta=off&marketdata.columns=SECID,LAST,CURRENTVALUE",
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("MOEX fetch failed");
  const json = (await res.json()) as MoexJson;
  return normalizeMoexMarketRates(json);
}

async function fetchBitcoinUsd(): Promise<Pick<MarketRates, "btcUsd">> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("BTC fetch failed");
  const json = (await res.json()) as CoinGeckoJson;
  return normalizeBitcoinMarketRates(json);
}

export async function getMarketRates(): Promise<MarketRates> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const results = await Promise.allSettled([
    fetchCbrRates(),
    fetchMoexIndex(),
    fetchBitcoinUsd(),
  ]);
  const fulfilled = results
    .filter((item): item is PromiseFulfilledResult<Partial<MarketRates>> => item.status === "fulfilled")
    .map((item) => item.value);

  const data = mergeSnapshots(fulfilled);
  if (hasAnyRate(data)) {
    cache = { data, at: Date.now() };
    return data;
  }

  if (cache) {
    return {
      ...cache.data,
      stale: true,
    };
  }

  throw new Error("Market rates unavailable");
}

export function resetMarketRatesCacheForTests(): void {
  cache = null;
}

export function seedMarketRatesCacheForTests(data: MarketRates, ageMs = 0): void {
  cache = {
    data,
    at: Date.now() - ageMs,
  };
}
