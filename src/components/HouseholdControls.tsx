"use client";

import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import {
  hasPartnerBudget,
  myDisplayName,
  partnerDisplayName,
  partnerTabLabel,
} from "@/lib/owner-labels";
import { useStore } from "@/store/useStore";
import type { BudgetOwner, HouseholdFilter } from "@/types";

export function EntryOwnerToggle() {
  const locale = useStore((s) => s.locale);
  const userName = useStore((s) => s.userName);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const entryOwner = useStore((s) => s.entryOwner);
  const setEntryOwner = useStore((s) => s.setEntryOwner);

  if (!hasPartnerBudget(partnerName, partnerKeywords)) return null;

  const partnerLabel =
    partnerDisplayName(partnerName) ||
    partnerTabLabel(locale, partnerName, partnerKeywords);

  const options: { id: BudgetOwner; label: string }[] = [
    { id: "me", label: myDisplayName(locale, userName) },
    { id: "partner", label: partnerLabel },
  ];

  return (
    <div className="flex w-full max-w-md gap-2">
      {options.map((opt) => (
        <Button
          key={opt.id}
          type="button"
          variant={entryOwner === opt.id ? "default" : "outline"}
          className="flex-1 text-sm"
          onClick={() => setEntryOwner(opt.id)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export function HouseholdFilterTabs() {
  const locale = useStore((s) => s.locale);
  const userName = useStore((s) => s.userName);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const householdFilter = useStore((s) => s.householdFilter);
  const setHouseholdFilter = useStore((s) => s.setHouseholdFilter);

  if (!hasPartnerBudget(partnerName, partnerKeywords)) return null;

  const partnerLabel =
    partnerDisplayName(partnerName) ||
    partnerTabLabel(locale, partnerName, partnerKeywords);

  const tabs: { id: HouseholdFilter; label: string }[] = [
    { id: "all", label: t(locale, "householdAll") },
    { id: "me", label: myDisplayName(locale, userName) },
    { id: "partner", label: partnerLabel },
  ];

  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setHouseholdFilter(tab.id)}
          className={[
            "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            householdFilter === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
