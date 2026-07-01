"use client";

import { ChevronDown, ChevronUp, MessageCircle, Shuffle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pickRandomMiniTips } from "@/lib/budget-mini-tips";
import { t } from "@/lib/i18n";
import { AI_RECOMMENDATIONS_HIDDEN_KEY } from "@/lib/storage-reset";
import { useStore } from "@/store/useStore";

const TIP_COUNT = 3;

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AI_RECOMMENDATIONS_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(AI_RECOMMENDATIONS_HIDDEN_KEY, "1");
    else localStorage.removeItem(AI_RECOMMENDATIONS_HIDDEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Три случайных мини-совета о бюджете */
export function AIRecommendations() {
  const locale = useStore((s) => s.locale);
  const [hidden, setHidden] = useState(false);
  const [tips, setTips] = useState(() => pickRandomMiniTips(TIP_COUNT));

  useEffect(() => {
    setHidden(readHidden());
  }, []);

  const shuffle = useCallback(() => {
    setTips(pickRandomMiniTips(TIP_COUNT));
  }, []);

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
      <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <MessageCircle className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{t(locale, "recommendations")}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={show}>
          <ChevronDown className="h-4 w-4" />
          {t(locale, "recommendationsShow")}
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{t(locale, "recommendations")}</span>
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
            {t(locale, "recommendationsHide")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={shuffle}
            aria-label={t(locale, "quotesShuffle")}
          >
            <Shuffle className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {tips.map((tip) => (
            <li key={tip} className="rounded-md bg-secondary/60 p-2.5 leading-snug text-foreground/90">
              {tip}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
