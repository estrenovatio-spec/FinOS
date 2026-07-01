"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { MarketRates } from "@/lib/market-rates";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { useStore } from "@/store/useStore";

const POLL_MS = 30_000;

function formatFiatRate(value: number, locale: "ru" | "en"): string {
  return value.toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBtcUsd(value: number, locale: "ru" | "en"): string {
  return value.toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: 0,
  });
}

function formatMoexIndex(value: number, locale: "ru" | "en"): string {
  return value.toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MoexBadge() {
  return (
    <svg
      viewBox="0 0 36 14"
      className="h-3.5 w-[2.15rem] shrink-0"
      role="img"
      aria-label="MOEX"
    >
      <rect width="36" height="14" rx="2" fill="#E30613" />
      <text
        x="18"
        y="10.2"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="7.5"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="0.04em"
      >
        MOEX
      </text>
    </svg>
  );
}

function BtcCoinBadge() {
  const gradId = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 drop-shadow-sm"
      role="img"
      aria-label="Bitcoin"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE566" />
          <stop offset="45%" stopColor="#F5A623" />
          <stop offset="100%" stopColor="#C7860A" />
        </linearGradient>
      </defs>
      <circle cx="8" cy="8" r="7.25" fill={`url(#${gradId})`} stroke="#A66B00" strokeWidth="0.6" />
      <circle cx="8" cy="8" r="6.1" fill="none" stroke="#FFEB99" strokeWidth="0.35" opacity="0.85" />
      <text
        x="8"
        y="11.4"
        textAnchor="middle"
        fill="#5C3D00"
        fontSize="9"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        B
      </text>
    </svg>
  );
}

type RateCellProps = {
  badge: ReactNode;
  value: string;
  flash: boolean;
  title?: string;
  badgeClassName?: string;
};

function RateCell({
  badge,
  value,
  flash,
  title,
  badgeClassName,
}: RateCellProps) {
  return (
    <div
      title={title}
      className={`inline-flex w-full min-w-0 items-center justify-center gap-0.5 whitespace-nowrap rounded-md px-0.5 py-0.5 transition-colors duration-700 ${
        flash ? "bg-emerald-500/15" : ""
      }`}
    >
      <div
        className={`flex shrink-0 items-center justify-center ${badgeClassName ?? ""}`}
      >
        {badge}
      </div>
      <span className="text-[10px] font-semibold leading-none tabular-nums sm:text-[11px]">
        {value}
      </span>
    </div>
  );
}

const FIAT_BADGE_SLOT = "w-3";
const MOEX_BADGE_SLOT = "w-[2rem]";
const BTC_BADGE_SLOT = "w-[2rem]";

/** Курсы: сверху $ и MOEX, снизу € под $ и BTC под MOEX */
export function LiveRatesBar() {
  const locale = useStore((s) => s.locale);
  const [rates, setRates] = useState<MarketRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState({ usd: false, eur: false, btc: false, moex: false });
  const prevRef = useRef<MarketRates | null>(null);

  const pulseFlash = useCallback((next: MarketRates) => {
    const prev = prevRef.current;
    if (!prev) return;
    const changed = {
      usd: prev.usdRub !== next.usdRub,
      eur: prev.eurRub !== next.eurRub,
      btc: prev.btcUsd !== next.btcUsd,
      moex: prev.moexIndex !== next.moexIndex,
    };
    if (!changed.usd && !changed.eur && !changed.btc && !changed.moex) return;
    setFlash(changed);
    window.setTimeout(
      () => setFlash({ usd: false, eur: false, btc: false, moex: false }),
      900,
    );
  }, []);

  const loadRates = useCallback(async () => {
    try {
      const res = await fetchWithRetry("/api/rates", { cache: "no-store" });
      const json = (await res.json()) as { success?: boolean; rates?: MarketRates };
      if (!res.ok || !json.success || !json.rates) return;
      pulseFlash(json.rates);
      prevRef.current = json.rates;
      setRates(json.rates);
    } catch {
      /* keep last values */
    } finally {
      setLoading(false);
    }
  }, [pulseFlash]);

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

  return (
    <div
      className="grid w-full grid-cols-4 gap-1.5 leading-none sm:gap-2"
      aria-live="polite"
    >
      <RateCell
        badge={<span className="text-[12px] font-bold leading-none text-emerald-500">$</span>}
        badgeClassName={FIAT_BADGE_SLOT}
        value={formatFiatRate(rates.usdRub, locale)}
        flash={flash.usd}
        title="USD/RUB"
      />
      <RateCell
        badge={<span className="text-[12px] font-bold leading-none text-blue-500">€</span>}
        badgeClassName={FIAT_BADGE_SLOT}
        value={formatFiatRate(rates.eurRub, locale)}
        flash={flash.eur}
        title="EUR/RUB"
      />
      <RateCell
        badge={<MoexBadge />}
        badgeClassName={MOEX_BADGE_SLOT}
        value={formatMoexIndex(rates.moexIndex, locale)}
        flash={flash.moex}
        title="IMOEX"
      />
      <RateCell
        badge={<BtcCoinBadge />}
        badgeClassName={BTC_BADGE_SLOT}
        value={`$${formatBtcUsd(rates.btcUsd, locale)}`}
        flash={flash.btc}
        title="BTC/USD"
      />
    </div>
  );
}
