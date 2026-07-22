"use client";

import { AlertCircle, CheckCircle2, Circle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TodayHeroView } from "@/components/today/today-screen-presenter";

const HERO_TONE_STYLES = {
  calm: "border-emerald-500/15 bg-emerald-500/[0.04]",
  risk: "border-amber-500/20 bg-amber-500/[0.05]",
  action: "border-primary/15 bg-primary/[0.045]",
  setup: "border-sky-500/15 bg-sky-500/[0.05]",
} as const;

export function TodayHero({
  hero,
  actionBusy,
  actionError,
  onAction,
  onSecondaryAction,
}: {
  hero: TodayHeroView;
  actionBusy: boolean;
  actionError: string | null;
  onAction: () => void;
  onSecondaryAction?: (() => void) | null;
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
    <section
      className={cn(
        "space-y-4 rounded-[28px] border px-5 py-5 shadow-none backdrop-blur-sm",
        HERO_TONE_STYLES[hero.tone],
      )}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/80 px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-foreground/75">
          <StatusIcon className="h-3.5 w-3.5" />
          {hero.statusLabel}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium tracking-[0.08em] text-muted-foreground">
          Ближайшее действие
        </p>
        <div className="space-y-1.5">
          <p className="text-[1.45rem] font-semibold leading-tight tracking-tight text-foreground">
            {hero.title}
          </p>
          {hero.amount ? (
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {hero.amount}
            </p>
          ) : null}
          {hero.due ? (
            <p className="text-sm font-medium text-foreground/80">{hero.due}</p>
          ) : null}
          {hero.reason ? (
            <p className="max-w-[34rem] text-sm leading-6 text-muted-foreground">
              {hero.reason}
            </p>
          ) : null}
        </div>
      </div>

      {hero.ctaLabel ? (
        hero.secondaryCtaLabel ? (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" className="w-full" onClick={onAction} disabled={actionBusy}>
              {hero.ctaLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onSecondaryAction ?? undefined}
              disabled={actionBusy}
            >
              {hero.secondaryCtaLabel}
            </Button>
          </div>
        ) : (
          <Button type="button" className="w-full sm:w-auto" onClick={onAction} disabled={actionBusy}>
            {hero.ctaLabel}
          </Button>
        )
      ) : null}

      {actionError ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </div>
      ) : null}
    </section>
  );
}
