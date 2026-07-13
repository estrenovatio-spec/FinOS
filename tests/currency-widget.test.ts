import assert from "node:assert/strict";
import test from "node:test";
import {
  getMarketRates,
  normalizeBitcoinMarketRates,
  normalizeCbrMarketRates,
  normalizeMoexMarketRates,
  resetMarketRatesCacheForTests,
  seedMarketRatesCacheForTests,
} from "@/lib/market-rates";
import { buildTodayRatesView } from "@/lib/today-rates";

function marketResponse(url: string): Response {
  if (url.includes("cbr-xml-daily")) {
    return new Response(
      JSON.stringify({
        Date: "2026-07-13T10:30:00+03:00",
        Valute: {
          USD: { Value: 88.45, Nominal: 1 },
          EUR: { Value: 96.2, Nominal: 1 },
        },
      }),
      { status: 200 },
    );
  }

  if (url.includes("iss.moex.com")) {
    return new Response(
      JSON.stringify({
        marketdata: {
          columns: ["SECID", "LAST", "CURRENTVALUE"],
          data: [["IMOEX", 2840.5, 2840.5]],
        },
      }),
      { status: 200 },
    );
  }

  if (url.includes("coingecko")) {
    return new Response(JSON.stringify({ bitcoin: { usd: 62500 } }), {
      status: 200,
    });
  }

  return new Response("unknown provider", { status: 404 });
}

test("CBR rates normalize USD and EUR into RUB per one unit", () => {
  const rates = normalizeCbrMarketRates({
    Date: "2026-07-13T10:30:00+03:00",
    Valute: {
      USD: { Value: 88.45, Nominal: 1 },
      EUR: { Value: 96.2, Nominal: 1 },
    },
  });

  assert.equal(rates.usdRub, 88.45);
  assert.equal(rates.eurRub, 96.2);
});

test("CBR normalization does not invert Nominal-based rates", () => {
  const rates = normalizeCbrMarketRates({
    Date: "2026-07-13T10:30:00+03:00",
    Valute: {
      USD: { Value: 920, Nominal: 10 },
      EUR: { Value: 1040, Nominal: 10 },
    },
  });

  assert.equal(rates.usdRub, 92);
  assert.equal(rates.eurRub, 104);
});

test("MOEX and Bitcoin providers normalize their market values", () => {
  const moex = normalizeMoexMarketRates({
    marketdata: {
      columns: ["SECID", "LAST", "CURRENTVALUE"],
      data: [["IMOEX", 2840.5, 2840.5]],
    },
  });
  const btc = normalizeBitcoinMarketRates({ bitcoin: { usd: 62500 } });

  assert.equal(moex.moexIndex, 2840.5);
  assert.equal(btc.btcUsd, 62500);
});

test("market rates use server cache instead of refetching immediately", async () => {
  resetMarketRatesCacheForTests();
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls += 1;
    return marketResponse(String(input));
  }) as typeof fetch;

  try {
    const first = await getMarketRates();
    const second = await getMarketRates();
    assert.equal(first.usdRub, second.usdRub);
    assert.equal(first.moexIndex, 2840.5);
    assert.equal(first.btcUsd, 62500);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    resetMarketRatesCacheForTests();
  }
});

test("one provider failure does not hide the remaining market indicators", async () => {
  resetMarketRatesCacheForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("coingecko")) {
      return new Response("btc failed", { status: 502 });
    }
    return marketResponse(url);
  }) as typeof fetch;

  try {
    const rates = await getMarketRates();
    assert.equal(rates.usdRub, 88.45);
    assert.equal(rates.eurRub, 96.2);
    assert.equal(rates.moexIndex, 2840.5);
    assert.equal(rates.btcUsd, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    resetMarketRatesCacheForTests();
  }
});

test("market rates fall back to the last successful cache when every provider fails", async () => {
  resetMarketRatesCacheForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("upstream failed", { status: 502 })) as typeof fetch;

  try {
    seedMarketRatesCacheForTests(
      {
        usdRub: 88.45,
        eurRub: 96.2,
        moexIndex: 2840.5,
        btcUsd: 62500,
        updatedAt: "2026-07-13T10:30:00.000Z",
        stale: false,
      },
      31 * 60 * 1000,
    );

    const cached = await getMarketRates();
    assert.equal(cached.usdRub, 88.45);
    assert.equal(cached.moexIndex, 2840.5);
    assert.equal(cached.btcUsd, 62500);
    assert.equal(cached.stale, true);
  } finally {
    globalThis.fetch = originalFetch;
    resetMarketRatesCacheForTests();
  }
});

test("today market view shows USD, EUR, MOEX, Bitcoin, update time, and stale fallback note", () => {
  const view = buildTodayRatesView({
    locale: "ru",
    loading: false,
    hasError: false,
    rates: {
      usdRub: 88.45,
      eurRub: 96.2,
      moexIndex: 2840.5,
      btcUsd: 62500,
      updatedAt: "2026-07-13T10:30:00+03:00",
      stale: true,
    },
  });

  assert.equal(view.title, "Рынки");
  assert.deepEqual(
    view.rows.map((row) => row.code),
    ["USD", "EUR", "MOEX", "BTC"],
  );
  assert.equal(view.rows[0]?.label, "USD/RUB");
  assert.equal(view.rows[2]?.label, "Мосбиржа");
  assert.match(view.rows[3]?.value ?? "", /^\$/);
  assert.match(view.updatedLabel ?? "", /Обновлено/);
  assert.match(view.note ?? "", /устаревшими/i);
});

test("today market view filters invalid values and keeps Today stable on API failure", () => {
  const partial = buildTodayRatesView({
    locale: "ru",
    loading: false,
    hasError: false,
    rates: {
      usdRub: 88.45,
      eurRub: 0,
      moexIndex: Number.NaN,
      btcUsd: 62500,
      updatedAt: "2026-07-13T10:30:00+03:00",
      stale: false,
    },
  });
  const failed = buildTodayRatesView({
    locale: "ru",
    loading: false,
    hasError: true,
    rates: null,
  });

  assert.deepEqual(
    partial.rows.map((row) => row.code),
    ["USD", "BTC"],
  );
  assert.equal(failed.rows.length, 0);
  assert.equal(failed.isError, true);
  assert.match(failed.note ?? "", /временно недоступны/i);
});
