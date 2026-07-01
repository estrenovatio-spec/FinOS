import {
  AI_RECOMMENDATIONS_HIDDEN_KEY,
  CHART_HIDDEN_KEY,
  FAMILY_ONBOARDING_DONE_KEY,
  TRANSACTIONS_HIDDEN_KEY,
  TIPS_PANEL_HIDDEN_KEY,
  WEEKLY_ANALYSIS_HIDDEN_KEY,
} from "@/lib/storage-reset";
import { useStore } from "@/store/useStore";

export type OnboardingStepId = "voice" | "transactions" | "planning" | "chart" | "tips";

export const ONBOARDING_STEPS: OnboardingStepId[] = [
  "voice",
  "transactions",
  "planning",
  "chart",
  "tips",
];

export function isFamilyOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(FAMILY_ONBOARDING_DONE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markFamilyOnboardingDone(): void {
  try {
    localStorage.setItem(FAMILY_ONBOARDING_DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Прод: при первом визите сворачиваем цели, статистику и советы. */
export function applyFirstVisitCollapsedState(): void {
  if (isFamilyOnboardingDone()) return;
  try {
    localStorage.setItem(TRANSACTIONS_HIDDEN_KEY, "1");
    useStore.getState().setPlanningPanelCollapsed(true);
    localStorage.setItem(CHART_HIDDEN_KEY, "1");
    localStorage.setItem(TIPS_PANEL_HIDDEN_KEY, "1");
    localStorage.setItem(AI_RECOMMENDATIONS_HIDDEN_KEY, "1");
    localStorage.setItem(WEEKLY_ANALYSIS_HIDDEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function onboardingTargetSelector(step: OnboardingStepId): string {
  return `[data-onboarding="${step}"]`;
}
