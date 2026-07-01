"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBudgetPeriodLabel, getPreviousBudgetPeriod } from "@/lib/budget-period";
import { t } from "@/lib/i18n";
import { useStatsPeriod, useStore } from "@/store/useStore";

export function StatisticsPeriodControls() {
  const locale = useStore((s) => s.locale);
  const statsPeriodOverride = useStore((s) => s.statsPeriodOverride);
  const setStatsPeriodRange = useStore((s) => s.setStatsPeriodRange);
  const resetStatsPeriod = useStore((s) => s.resetStatsPeriod);
  const setStatsPreviousBudgetPeriod = useStore((s) => s.setStatsPreviousBudgetPeriod);
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const period = useStatsPeriod();
  const previousPeriod = getPreviousBudgetPeriod(budgetMonthStartDay);
  const isPrevious =
    statsPeriodOverride?.from === previousPeriod.from &&
    statsPeriodOverride?.to === previousPeriod.to;
  const isCustom = Boolean(statsPeriodOverride) && !isPrevious;
  const [customOpen, setCustomOpen] = useState(isCustom);

  const [draftFrom, setDraftFrom] = useState(period.from);
  const [draftTo, setDraftTo] = useState(period.to);

  useEffect(() => {
    setDraftFrom(period.from);
    setDraftTo(period.to);
  }, [period.from, period.to]);

  useEffect(() => {
    if (isCustom) setCustomOpen(true);
  }, [isCustom]);

  return (
    <div className="space-y-2 rounded-lg border border-border/80 bg-muted/30 p-2">
      <div className="grid grid-cols-3 gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={statsPeriodOverride === null ? "default" : "outline"}
          className="h-8 px-1 text-[11px]"
          onClick={() => {
            resetStatsPeriod();
            setCustomOpen(false);
          }}
        >
          {t(locale, "statsPeriodCurrent")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isPrevious ? "default" : "outline"}
          className="h-8 px-1 text-[11px]"
          onClick={() => {
            setStatsPreviousBudgetPeriod();
            setCustomOpen(false);
          }}
        >
          {t(locale, "statsPeriodPrevious")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={customOpen || isCustom ? "default" : "outline"}
          className="h-8 px-1 text-[11px]"
          onClick={() => setCustomOpen((value) => !value)}
        >
          {t(locale, "statsPeriodCustom")}
        </Button>
      </div>
      {customOpen ? (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
          <Input
            type="date"
            aria-label={t(locale, "statsPeriodFrom")}
            className="h-8 px-2 text-[11px]"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
          />
          <Input
            type="date"
            aria-label={t(locale, "statsPeriodTo")}
            className="h-8 px-2 text-[11px]"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 px-2 text-[11px]"
            onClick={() => {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(draftFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(draftTo)) return;
              if (draftFrom > draftTo) return;
              setStatsPeriodRange(draftFrom, draftTo);
            }}
          >
            {t(locale, "statsPeriodApply")}
          </Button>
        </div>
      ) : null}
      <p className="truncate text-[10px] text-muted-foreground">
        {t(locale, "statsPeriodLabel", {
          period: formatBudgetPeriodLabel(period, locale),
        })}
      </p>
    </div>
  );
}
