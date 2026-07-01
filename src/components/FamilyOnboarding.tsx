"use client";

import { ArrowDown, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { bottomNavEnabled } from "@/lib/app-bottom-nav";
import {
  ONBOARDING_STEPS,
  applyFirstVisitCollapsedState,
  isFamilyOnboardingDone,
  markFamilyOnboardingDone,
  onboardingTargetSelector,
  type OnboardingStepId,
} from "@/lib/family-onboarding";
import { t, type DictKey } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

const STEP_I18N: Record<OnboardingStepId, { title: DictKey; body: DictKey }> = {
  voice: { title: "onboardVoiceTitle", body: "onboardVoiceBody" },
  transactions: { title: "onboardTxTitle", body: "onboardTxBody" },
  planning: { title: "onboardPlanningTitle", body: "onboardPlanningBody" },
  chart: { title: "onboardChartTitle", body: "onboardChartBody" },
  tips: { title: "onboardTipsTitle", body: "onboardTipsBody" },
};

type Rect = { top: number; left: number; width: number; height: number };

function measureTarget(step: OnboardingStepId): Rect | null {
  const el = document.querySelector(onboardingTargetSelector(step));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function FamilyOnboarding() {
  const locale = useStore((s) => s.locale);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const step = ONBOARDING_STEPS[stepIndex];
  const isLast = stepIndex >= ONBOARDING_STEPS.length - 1;

  const finish = useCallback(() => {
    markFamilyOnboardingDone();
    setActive(false);
  }, []);

  const updateRect = useCallback(() => {
    if (!step) return;
    const rect = measureTarget(step);
    setTargetRect(rect);
    if (rect) {
      const el = document.querySelector(onboardingTargetSelector(step));
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [step]);

  useEffect(() => {
    if (bottomNavEnabled()) return;
    const forceFresh = new URLSearchParams(window.location.search).get("fresh") === "1";
    if (!forceFresh && isFamilyOnboardingDone()) return;

    const boot = () => {
      applyFirstVisitCollapsedState();
      setActive(true);
      setStepIndex(0);
    };

    if (useStore.persist.hasHydrated()) {
      boot();
      return;
    }
    return useStore.persist.onFinishHydration(boot);
  }, []);

  useEffect(() => {
    if (!active || !step) return;
    updateRect();
    const onResize = () => updateRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const tmr = window.setTimeout(updateRect, 350);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.clearTimeout(tmr);
    };
  }, [active, step, stepIndex, updateRect]);

  if (!active || !step) return null;

  const pad = 8;
  const highlight = targetRect
    ? {
        top: targetRect.top - pad,
        left: targetRect.left - pad,
        width: targetRect.width + pad * 2,
        height: targetRect.height + pad * 2,
      }
    : null;

  const bubbleHeight = 220;
  const viewportHeight = window.innerHeight;
  const bottomSafe = bottomNavEnabled() ? 96 : 24;
  const bubbleTop = (() => {
    if (!highlight) return Math.max(16, viewportHeight * 0.35);
    const below = highlight.top + highlight.height + 12;
    const above = highlight.top - bubbleHeight - 12;
    const canPlaceBelow = below + bubbleHeight <= viewportHeight - bottomSafe;
    const rawTop = canPlaceBelow ? below : above;
    return Math.min(
      Math.max(16, rawTop),
      Math.max(16, viewportHeight - bottomSafe - bubbleHeight),
    );
  })();

  const labels = STEP_I18N[step];

  return (
    <div className="fixed inset-0 z-[200] pointer-events-auto" aria-live="polite">
      <div className="absolute inset-0 bg-black/55" onClick={() => {}} aria-hidden />

      {highlight ? (
        <div
          className="absolute rounded-xl ring-4 ring-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all duration-300"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      ) : null}

      {highlight ? (
        <ArrowDown
          className="absolute h-6 w-6 animate-bounce text-primary"
          style={{
            top: Math.max(8, highlight.top - 28),
            left: highlight.left + highlight.width / 2 - 12,
          }}
          aria-hidden
        />
      ) : null}

      <div
        className="absolute left-4 right-4 mx-auto max-w-sm overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl"
        style={{ top: bubbleTop, maxHeight: `calc(100vh - ${bottomSafe + 16}px)` }}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {stepIndex + 1} / {ONBOARDING_STEPS.length}
          </p>
          <button
            type="button"
            className="rounded-md p-0.5 text-muted-foreground hover:bg-muted"
            aria-label={t(locale, "onboardSkip")}
            onClick={finish}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="text-base font-bold">{t(locale, labels.title)}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{t(locale, labels.body)}</p>
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={finish}>
            {t(locale, "onboardSkip")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            onClick={() => {
              if (isLast) finish();
              else setStepIndex((i) => i + 1);
            }}
          >
            {isLast ? t(locale, "onboardDone") : t(locale, "onboardNext")}
          </Button>
        </div>
      </div>
    </div>
  );
}
