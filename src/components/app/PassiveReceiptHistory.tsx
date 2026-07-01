"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  formatReceiptMonthLabel,
  groupPassiveReceiptsByYear,
} from "@/lib/business/passive-receipt-groups";
import type { BusinessPassiveReceipt } from "@/lib/business/types";
import { formatMoney } from "@/lib/format-money";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function PassiveReceiptHistory({
  receipts,
  assetId,
  locale,
}: {
  receipts: BusinessPassiveReceipt[];
  assetId: string;
  locale: "ru" | "en";
}) {
  const years = groupPassiveReceiptsByYear(receipts, assetId);
  const [openYear, setOpenYear] = useState<string | null>(years[0]?.year ?? null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  if (years.length === 0) return null;

  return (
    <div className="space-y-1.5 border-t border-border/50 pt-1.5">
      <div className="flex flex-wrap gap-1">
        {years.map((y) => (
          <button
            key={y.year}
            type="button"
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
              openYear === y.year
                ? "bg-primary text-primary-foreground"
                : "bg-muted/80 text-muted-foreground hover:bg-muted",
            )}
            onClick={() => {
              setOpenYear((prev) => (prev === y.year ? null : y.year));
              setOpenMonth(null);
            }}
          >
            {t(locale, "projectsHistoryYear", { year: y.year })}
            <span className="ml-1 opacity-90">
              · {formatMoney(y.total, locale)}
            </span>
          </button>
        ))}
      </div>

      {openYear ? (
        <div className="space-y-1">
          {years
            .find((y) => y.year === openYear)
            ?.months.map((mo) => {
              const monthOpen = openMonth === mo.monthKey;
              return (
                <div key={mo.monthKey} className="rounded-md bg-muted/30 px-2 py-1">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left text-[10px]"
                    onClick={() =>
                      setOpenMonth((prev) => (prev === mo.monthKey ? null : mo.monthKey))
                    }
                  >
                    <span className="font-medium text-foreground">
                      {formatReceiptMonthLabel(mo.monthKey, locale)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 tabular-nums text-emerald-700 dark:text-emerald-400">
                      {t(locale, "projectsHistoryMonthSummary", {
                        count: String(mo.count),
                        total: formatMoney(mo.total, locale),
                      })}
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 text-muted-foreground transition-transform",
                          monthOpen && "rotate-180",
                        )}
                        aria-hidden
                      />
                    </span>
                  </button>
                  {monthOpen ? (
                    <ul className="mt-1 space-y-0.5 border-t border-border/40 pt-1 text-[10px] tabular-nums text-muted-foreground">
                      {mo.receipts.map((r) => (
                        <li key={r.id} className="flex justify-between gap-2">
                          <span>{r.date}</span>
                          <span className="text-emerald-700 dark:text-emerald-400">
                            +{formatMoney(r.amount, locale)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
        </div>
      ) : null}
    </div>
  );
}
