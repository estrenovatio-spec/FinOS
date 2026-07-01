"use client";

import { ChevronDown, ChevronUp, Lightbulb, Shuffle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdvisorConfig } from "@/lib/advisor-config";
import { t } from "@/lib/i18n";
import { pickRandomPlanningTips } from "@/lib/planning-tips";
import { PLANNING_TIPS_HIDDEN_KEY } from "@/lib/storage-reset";
import { useStore } from "@/store/useStore";

const TIP_COUNT = 3;

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PLANNING_TIPS_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(PLANNING_TIPS_HIDDEN_KEY, "1");
    else localStorage.removeItem(PLANNING_TIPS_HIDDEN_KEY);
  } catch {
    /* ignore */
  }
}

export function PlanningTips() {
  const locale = useStore((s) => s.locale);
  const advisor = useMemo(() => getAdvisorConfig(), []);

  const [hidden, setHidden] = useState(false);
  const [tips, setTips] = useState(() => pickRandomPlanningTips(locale, advisor, TIP_COUNT));

  useEffect(() => {
    setHidden(readHidden());
  }, []);

  useEffect(() => {
    setTips(pickRandomPlanningTips(locale, advisor, TIP_COUNT));
  }, [locale, advisor]);

  const shuffleTips = useCallback(() => {
    setTips(pickRandomPlanningTips(locale, advisor, TIP_COUNT));
  }, [locale, advisor]);

  const show = useCallback(() => {
    setHidden(false);
    writeHidden(false);
  }, []);

  const hide = useCallback(() => {
    setHidden(true);
    writeHidden(true);
  }, []);

  if (hidden) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="truncate">{t(locale, "planningTipsTitle")}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={show}>
          <ChevronDown className="h-4 w-4" />
          {t(locale, "planningTipsShow")}
        </Button>
      </div>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="truncate">{t(locale, "planningTipsTitle")}</span>
        </CardTitle>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={hide}
          >
            <ChevronUp className="h-4 w-4" />
            {t(locale, "planningTipsHide")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={shuffleTips}
            aria-label={t(locale, "planningTipsShuffle")}
          >
            <Shuffle className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {tips.map((tip) => (
            <li
              key={tip}
              className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 leading-snug text-foreground/90"
            >
              {tip}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
