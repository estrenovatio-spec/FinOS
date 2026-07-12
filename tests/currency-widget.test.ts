import assert from "node:assert/strict";
import test from "node:test";
import {
  getMarketRates,
  normalizeCbrMarketRates,
  resetMarketRatesCacheForTests,
  seedMarketRatesCacheForTests,
} from "@/lib/market-rates";
import { buildTodayRatesView } from "@/lib/today-rates";

test("CBR rates normalize USD, EUR, and CNY into RUB per one unit", () => {
  const rates = normalizeCbrMarketRates({
    Date: "2026-07-13T10:30:00+03:00",
    Valute: {
      USD: { Value: 88.45, Nominal: 1 },
      EUR: { Value: 96.2, Nominal: 1 },
      CNY: { Value: 12.15, Nominal: 1 },
    },
  });

  assert.equal(rates.usdRub, 88.45);
  assert.equal(rates.eurRub, 96.2);
  assert.equal(rates.cnyRub, 12.15);
  assert.equal(rates.stale, false);
});

test("CBR normalization does not invert Nominal-based rates", () => {
  const rates = normalizeCbrMarketRates({
    Date: "2026-07-13T10:30:00+03:00",
    Valute: {
      USD: { Value: 92, Nominal: 1 },
      EUR: { Value: 104, Nominal: 1 },
      CNY: { Value: 129.5, Nominal: 10 },
    },
  });

  assert.equal(rates.cnyRub, 12.95);
});

test("market rates use server cache instead of refetching immediately", async () => {
  resetMarketRatesCacheForTests();
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        Date: "2026-07-13T10:30:00+03:00",
        Valute: {
          USD: { Value: 88.45, Nominal: 1 },
          EUR: { Value: 96.2, Nominal: 1 },
          CNY: { Value: 12.15, Nominal: 1 },
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const first = await getMarketRates();
    const second = await getMarketRates();
    assert.equal(first.usdRub, second.usdRub);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetMarketRatesCacheForTests();
  }
});

test("market rates fall back to the last successful cache on provider failure", async () => {
  resetMarketRatesCacheForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("upstream failed", { status: 502 });
  }) as typeof fetch;

  try {
    seedMarketRatesCacheForTests(
      {
        usdRub: 88.45,
        eurRub: 96.2,
        cnyRub: 12.15,
        updatedAt: "2026-07-13T10:30:00.000Z",
        stale: false,
      },
      31 * 60 * 1000,
    );

    const cached = await getMarketRates();
    assert.equal(cached.usdRub, 88.45);
    assert.equal(cached.stale, true);
  } finally {
    globalThis.fetch = originalFetch;
    resetMarketRatesCacheForTests();
  }
});

test("today rates view shows USD, EUR, CNY, update time, and stale fallback note", () => {
  const view = buildTodayRatesView({
    locale: "ru",
    loading: false,
    hasError: false,
    rates: {
      usdRub: 88.45,
      eurRub: 96.2,
      cnyRub: 12.15,
      updatedAt: "2026-07-13T10:30:00+03:00",
      stale: true,
    },
  });

  assert.equal(view.title, "Курсы валют");
  assert.equal(view.rows.length, 3);
  assert.equal(view.rows[0]?.label, "1 USD");
  assert.match(view.rows[0]?.value ?? "", /88/);
  assert.match(view.updatedLabel ?? "", /Обновлено/);
  assert.match(view.note ?? "", /не обновляются/i);
});

test("today rates view keeps Today stable when API fails without cache", () => {
  const view = buildTodayRatesView({
    locale: "ru",
    loading: false,
    hasError: true,
    rates: null,
  });

  assert.equal(view.rows.length, 0);
  assert.equal(view.isError, true);
  assert.match(view.note ?? "", /временно недоступны/i);
});
