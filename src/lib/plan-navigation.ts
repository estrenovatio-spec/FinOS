export type PlanSection =
  | "recurring"
  | "goals"
  | "limits"
  | "debts"
  | "funds"
  | "emergency";

const PLAN_SECTION_STORAGE_KEY = "vb_plan_section_v1";
const LEGACY_TAB_STORAGE_KEY = "vb_app_tab_v1";

function normalizePlanSection(raw: string | null | undefined): PlanSection | null {
  switch (raw) {
    case "recurring":
    case "regulars":
      return "recurring";
    case "goals":
      return "goals";
    case "limits":
      return "limits";
    case "debts":
      return "debts";
    case "funds":
      return "funds";
    case "emergency":
    case "safety":
      return "emergency";
    default:
      return null;
  }
}

export function readRequestedPlanSection(): PlanSection | null {
  if (typeof window === "undefined") return null;
  try {
    const search = new URLSearchParams(window.location.search);
    const requested = normalizePlanSection(search.get("planSection") ?? search.get("section"));
    if (requested) return requested;
    const legacyTab = search.get("tab");
    if (legacyTab === "recurring" || legacyTab === "regulars" || legacyTab === "business") {
      return "recurring";
    }
    return null;
  } catch {
    return null;
  }
}

export function readStoredPlanSection(): PlanSection {
  if (typeof window === "undefined") return "recurring";
  const requested = readRequestedPlanSection();
  if (requested) return requested;
  try {
    const legacyTab = sessionStorage.getItem(LEGACY_TAB_STORAGE_KEY);
    if (legacyTab === "recurring" || legacyTab === "regulars" || legacyTab === "business") {
      return "recurring";
    }
    return normalizePlanSection(sessionStorage.getItem(PLAN_SECTION_STORAGE_KEY)) ?? "recurring";
  } catch {
    return "recurring";
  }
}

export function writeStoredPlanSection(section: PlanSection): void {
  try {
    sessionStorage.setItem(PLAN_SECTION_STORAGE_KEY, section);
  } catch {
    /* ignore */
  }
}
