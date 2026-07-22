"use client";

import { AlertCircle, CheckCircle2, Circle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TodayHeroView } from "@/components/today/today-screen-presenter";

const HERO_TONE_STYLES = {
  calm: "border-emerald-500/12 bg-emerald-500/[0.03]",
  risk: "border-amber-500/18 bg-amber-500/[0.045]",
  action: "border-primary/12 bg-primary/[0.035]",
  setup: "border-sky-500/12 bg-sky-500/[0.04]",
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
        "space-y-3 rounded-[24px] border px-4 py-4 shadow-none backdrop-blur-sm",
        HERO_TONE_STYLES[hero.tone],
      )}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/85 px-3 py-1 text-[10px] font-medium tracking-[0.14em] text-foreground/70">
          <StatusIcon className="h-3.5 w-3.5" />
          {hero.statusLabel}
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Ближайшее действие
        </p>
        <div className="space-y-1.5">
          <p className="text-[1.2rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[1.35rem]">
            {hero.title}
          </p>
          {hero.amount ? (
            <p className="text-lg font-semibold tracking-tight text-foreground">
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
            <Button type="button" className="h-11 w-full rounded-2xl" onClick={onAction} disabled={actionBusy}>
              {hero.ctaLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-2xl"
              onClick={onSecondaryAction ?? undefined}
              disabled={actionBusy}
            >
              {hero.secondaryCtaLabel}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            className="h-11 w-full rounded-2xl sm:w-auto"
            onClick={onAction}
            disabled={actionBusy}
          >
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
