"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchWithRetry } from "@/lib/fetch-retry";
import type { MarketRates } from "@/lib/market-rates";
import { buildTodayRatesView } from "@/lib/today-rates";

const REFRESH_MS = 15 * 60 * 1000;

export function TodayRatesCard({
  locale,
}: {
  locale: "ru" | "en";
}) {
  const [rates, setRates] = useState<MarketRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const loadRates = useCallback(async () => {
    try {
      const res = await fetchWithRetry("/api/rates", { cache: "no-store" });
      const json = (await res.json()) as {
        success?: boolean;
        rates?: MarketRates;
      };
      if (!res.ok || !json.success || !json.rates) {
        setHasError(true);
        return;
      }
      setRates(json.rates);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRates();
    const timer = window.setInterval(() => void loadRates(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadRates]);

  const view = buildTodayRatesView({
    locale,
    rates,
    loading,
    hasError,
  });

  if (!view.isLoading && view.rows.length === 0 && !view.note) {
    return null;
  }

  return (
    <Card className="border-border/25 bg-card/95 shadow-none">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{view.title}</p>
          {view.isLoading ? (
            <Loader2
              className="h-4 w-4 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </div>

        {view.rows.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {view.rows.map((row) => (
              <div
                key={row.code}
                className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {row.label}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {row.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {view.updatedLabel ? (
          <p className="text-xs leading-snug text-muted-foreground">
            {view.updatedLabel}
          </p>
        ) : null}

        {view.note ? (
          <p className="text-xs leading-snug text-muted-foreground">
            {view.note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
