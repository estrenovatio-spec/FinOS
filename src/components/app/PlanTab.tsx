"use client";

import { PlanningPanel } from "@/components/PlanningPanel";
import type { PlanSection } from "@/lib/plan-navigation";

export function PlanTab({
  section,
  entityId,
  onSectionChange,
}: {
  section: PlanSection;
  entityId: string | null;
  onSectionChange: (section: PlanSection) => void;
}) {
  return (
    <div className="space-y-5 py-3">
      <div>
        <h2 className="finos-page-title">План</h2>
        <p className="finos-page-subtitle">
          Доходы, платежи, цели и бюджеты на будущее.
        </p>
      </div>
      <PlanningPanel
        collapsible={false}
        activeTab={section}
        onActiveTabChange={(tab) => onSectionChange(tab as PlanSection)}
        visibleTabs={["recurring", "goals", "limits", "debts", "funds", "emergency", "stats", "advisor"]}
        focusEntityId={entityId}
      />
    </div>
  );
}
