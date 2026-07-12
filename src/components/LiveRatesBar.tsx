"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchWithRetry } from "@/lib/fetch-retry";
import type { MarketRates } from "@/lib/market-rates";
import { useStore } from "@/store/useStore";

const POLL_MS = 15 * 60 * 1000;

function formatRate(value: number, locale: "ru" | "en"): string {
  return value.toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function LiveRatesBar() {
  const locale = useStore((s) => s.locale);
  const [rates, setRates] = useState<MarketRates | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRates = useCallback(async () => {
    try {
      const res = await fetchWithRetry("/api/rates", { cache: "no-store" });
      const json = (await res.json()) as { success?: boolean; rates?: MarketRates };
      if (!res.ok || !json.success || !json.rates) return;
      setRates(json.rates);
    } catch {
      /* keep last rates */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRates();
    const timer = window.setInterval(() => void loadRates(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadRates]);

  if (loading && !rates) {
    return (
      <div className="flex h-7 items-center justify-end">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (!rates) return null;

  const items = [
    { code: "USD", value: rates.usdRub },
    { code: "EUR", value: rates.eurRub },
    { code: "CNY", value: rates.cnyRub },
  ] as const;

  return (
    <div className="grid w-full grid-cols-3 gap-1.5 leading-none sm:gap-2" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.code}
          title={`${item.code}/RUB`}
          className="inline-flex w-full min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 py-0.5"
        >
          <span className="text-[10px] font-semibold leading-none text-muted-foreground sm:text-[11px]">
            {item.code}
          </span>
          <span className="text-[10px] font-semibold leading-none tabular-nums sm:text-[11px]">
            {formatRate(item.value, locale)}
          </span>
        </div>
      ))}
    </div>
  );
}
