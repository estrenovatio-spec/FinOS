"use client";

import { AlertCircle, CheckCircle2, Circle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TodayHeroView } from "@/components/today/today-screen-presenter";

const HERO_TONE_STYLES = {
  calm: "border-emerald-500/20 bg-emerald-500/5",
  risk: "border-amber-500/25 bg-amber-500/5",
  action: "border-primary/25 bg-primary/5",
  setup: "border-sky-500/20 bg-sky-500/5",
} as const;

export function TodayHero({
  hero,
  actionBusy,
  actionError,
  onAction,
}: {
  hero: TodayHeroView;
  actionBusy: boolean;
  actionError: string | null;
  onAction: () => void;
}) {
  const StatusIcon =
    hero.tone === "calm"
      ? CheckCircle2
      : hero.tone === "setup"
        ? Circle
        : hero.tone === "risk"
          ? AlertCircle
          : ShieldAlert;

  return (
    <Card className={cn("shadow-none", HERO_TONE_STYLES[hero.tone])}>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground/80">
            <StatusIcon className="h-3.5 w-3.5" />
            {hero.statusLabel}
          </span>
        </div>

        <div className="space-y-2">
          <p className="text-[1.6rem] font-semibold leading-tight tracking-tight text-foreground">
            {hero.title}
          </p>
          {hero.amount ? (
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {hero.amount}
            </p>
          ) : null}
          {hero.due ? (
            <p className="text-sm font-medium text-foreground/85">{hero.due}</p>
          ) : null}
          {hero.reason ? (
            <p className="max-w-[34rem] text-sm leading-snug text-muted-foreground">
              {hero.reason}
            </p>
          ) : null}
        </div>

        {hero.ctaLabel ? (
          <Button type="button" className="w-full" onClick={onAction} disabled={actionBusy}>
            {hero.ctaLabel}
          </Button>
        ) : null}

        {actionError ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
            {actionError}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
