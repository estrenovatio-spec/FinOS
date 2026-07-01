"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AiCoachingContext,
  FamilyAdvisorSpotlight,
} from "@/lib/ai-coaching-context";
import type { Locale } from "@/types";

const FAMILY_ADVISOR_CACHE_KEY = "voicebudget-family-advisor-ai-v1";
const inflight = new Map<string, Promise<FamilyAdvisorSpotlight | null>>();

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function compactContext(ctx: AiCoachingContext) {
  return {
    categoryBudgets: ctx.categoryBudgets.slice(0, 4),
    savingsGoals: ctx.savingsGoals.slice(0, 4),
    smartSignals: ctx.smartSignals,
    categoryHabits: ctx.personalMemory?.categoryHabits.slice(0, 3) ?? [],
    learnedRulesCount: ctx.personalMemory?.learnedRules.length ?? 0,
  };
}

function readCached(cacheId: string): FamilyAdvisorSpotlight | null {
  try {
    const raw = localStorage.getItem(FAMILY_ADVISOR_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      cacheId?: string;
      spotlight?: FamilyAdvisorSpotlight;
    };
    return parsed.cacheId === cacheId && parsed.spotlight
      ? parsed.spotlight
      : null;
  } catch {
    return null;
  }
}

function writeCached(cacheId: string, spotlight: FamilyAdvisorSpotlight): void {
  try {
    localStorage.setItem(
      FAMILY_ADVISOR_CACHE_KEY,
      JSON.stringify({ cacheId, spotlight }),
    );
  } catch {
    /* localStorage can be unavailable in embedded browsers. */
  }
}

export function useFamilyAdvisorSpotlight(
  base: FamilyAdvisorSpotlight | null,
  ctx: AiCoachingContext,
  locale: Locale,
): FamilyAdvisorSpotlight | null {
  const [aiSpotlight, setAiSpotlight] = useState<FamilyAdvisorSpotlight | null>(
    null,
  );
  const compact = useMemo(() => compactContext(ctx), [ctx]);
  const cacheId = useMemo(
    () =>
      `${todayKey()}:${locale}:${JSON.stringify(base)}:${JSON.stringify(compact)}`,
    [base, compact, locale],
  );

  useEffect(() => {
    if (!base) {
      setAiSpotlight(null);
      return;
    }

    const cached = readCached(cacheId);
    if (cached) {
      setAiSpotlight(cached);
      return;
    }

    let cancelled = false;
    setAiSpotlight(null);
    const request =
      inflight.get(cacheId) ??
      fetch("/api/family-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, spotlight: base, context: compact }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (data) =>
            (data?.spotlight as FamilyAdvisorSpotlight | undefined) ?? null,
        )
        .finally(() => {
          inflight.delete(cacheId);
        });
    if (!inflight.has(cacheId)) inflight.set(cacheId, request);

    request
      .then((data) => {
        if (cancelled || !data) return;
        setAiSpotlight(data);
        writeCached(cacheId, data);
      })
      .catch(() => {
        if (!cancelled) setAiSpotlight(null);
      });

    return () => {
      cancelled = true;
    };
  }, [base, cacheId, compact, locale]);

  return aiSpotlight ?? base;
}
