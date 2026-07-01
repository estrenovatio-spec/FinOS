"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  formatUtilitiesMonthLabel,
  groupUtilitiesByYear,
} from "@/lib/business/housing-utilities-log";
import { rentalUtilitiesAverage } from "@/lib/business/rental-utilities";
import type { BusinessAsset } from "@/lib/business/types";
import { formatMoney } from "@/lib/format-money";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function RentalUtilitiesHistory({
  asset,
  locale,
  compact = false,
}: {
  asset: BusinessAsset;
  locale: "ru" | "en";
  compact?: boolean;
}) {
  const years = groupUtilitiesByYear(asset);
  const [openYear, setOpenYear] = useState<string | null>(years[0]?.year ?? null);
  const avg = rentalUtilitiesAverage(asset);

  if (years.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", compact ? "pt-1" : "border-t border-border/50 pt-1.5")}>
      <p className="text-[10px] font-medium text-muted-foreground">
        {t(locale, "projectsUtilitiesHistoryTitle")}
        {avg != null ? (
          <span className="ml-1 font-normal tabular-nums">
            · {t(locale, "projectsUtilitiesAvg", { amount: formatMoney(avg, locale) })}
          </span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-1">
        {years.map((y) => (
          <button
            key={y.year}
            type="button"
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
              openYear === y.year
                ? "bg-amber-600/90 text-white"
                : "bg-muted/80 text-muted-foreground hover:bg-muted",
            )}
            onClick={() => setOpenYear((prev) => (prev === y.year ? null : y.year))}
          >
            {t(locale, "projectsHistoryYear", { year: y.year })}
            <span className="ml-1 opacity-90">· {formatMoney(y.total, locale)}</span>
          </button>
        ))}
      </div>
      {openYear ? (
        <ul className="max-h-28 space-y-0.5 overflow-y-auto text-[10px]">
          {years
            .find((y) => y.year === openYear)
            ?.months.map((mo) => (
              <li
                key={mo.monthKey}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1 tabular-nums"
              >
                <span>{formatUtilitiesMonthLabel(mo.monthKey, locale)}</span>
                <span className="text-right">
                  <span className="text-amber-800 dark:text-amber-200">
                    −{formatMoney(mo.amount, locale)}
                  </span>
                  <span className="ml-1.5 text-emerald-700 dark:text-emerald-400">
                    {formatMoney(mo.netAfter, locale)}
                  </span>
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
