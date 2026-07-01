export type MarketRates = {
  usdRub: number;
  eurRub: number;
  btcUsd: number;
  moexIndex: number;
  updatedAt: string;
};

const CACHE_TTL_MS = 30_000;

let cache: { data: MarketRates; at: number } | null = null;

async function fetchCbrRates(): Promise<{ usdRub: number; eurRub: number }> {
  const res = await fetch("https://www.cbr-xml-daily.ru/daily_json.js", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("CBR fetch failed");

  const json = (await res.json()) as {
    Valute?: {
      USD?: { Value?: number; Nominal?: number };
      EUR?: { Value?: number; Nominal?: number };
    };
  };

  const usd = json.Valute?.USD;
  const eur = json.Valute?.EUR;
  const usdRub = usd?.Value && usd.Nominal ? usd.Value / usd.Nominal : NaN;
  const eurRub = eur?.Value && eur.Nominal ? eur.Value / eur.Nominal : NaN;

  if (!Number.isFinite(usdRub) || !Number.isFinite(eurRub)) {
    throw new Error("CBR parse failed");
  }

  return { usdRub, eurRub };
}

async function fetchBtcUsd(): Promise<number> {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("CoinGecko fetch failed");

  const json = (await res.json()) as { bitcoin?: { usd?: number } };
  const btcUsd = json.bitcoin?.usd;
  if (!Number.isFinite(btcUsd) || !btcUsd || btcUsd <= 0) {
    throw new Error("CoinGecko parse failed");
  }
  return btcUsd;
}

async function fetchMoexIndex(): Promise<number> {
  const url =
    "https://iss.moex.com/iss/engines/stock/markets/index/securities/IMOEX.json?iss.meta=off&iss.only=marketdata&marketdata.columns=CURRENTVALUE,LASTVALUE";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("MOEX fetch failed");

  const json = (await res.json()) as {
    marketdata?: { columns?: string[]; data?: (number | string | null)[][] };
  };
  const columns = json.marketdata?.columns ?? [];
  const row = json.marketdata?.data?.[0];
  if (!row?.length) throw new Error("MOEX parse failed");

  const pick = (name: string): number => {
    const idx = columns.indexOf(name);
    if (idx < 0) return NaN;
    const value = Number(row[idx]);
    return Number.isFinite(value) && value > 0 ? value : NaN;
  };

  const moexIndex = pick("CURRENTVALUE") || pick("LASTVALUE");
  if (!Number.isFinite(moexIndex)) throw new Error("MOEX value missing");
  return moexIndex;
}

export async function getMarketRates(): Promise<MarketRates> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const [cbr, btcUsd, moexIndex] = await Promise.all([
    fetchCbrRates(),
    fetchBtcUsd(),
    fetchMoexIndex(),
  ]);
  const data: MarketRates = {
    usdRub: cbr.usdRub,
    eurRub: cbr.eurRub,
    btcUsd,
    moexIndex,
    updatedAt: new Date().toISOString(),
  };
  cache = { data, at: Date.now() };
  return data;
}
