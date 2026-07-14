"use client";

import {
  Target,
  ChartColumn,
  House,
  ReceiptText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { AppTabId } from "@/lib/app-bottom-nav";
import { t } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

export const APP_BOTTOM_NAV_TABS: {
  id: AppTabId;
  icon: LucideIcon;
  labelKey:
    | "appTabHome"
    | "appTabSummary"
    | "appTabAdvisor"
    | "appTabBusiness"
    | "appTabMore";
}[] = [
  { id: "today", icon: House, labelKey: "appTabHome" },
  { id: "operations", icon: ReceiptText, labelKey: "appTabSummary" },
  { id: "forecast", icon: ChartColumn, labelKey: "appTabAdvisor" },
  { id: "plan", icon: Target, labelKey: "appTabBusiness" },
  { id: "settings", icon: Settings, labelKey: "appTabMore" },
];

export function AppBottomNav({
  active,
  onChange,
}: {
  active: AppTabId;
  onChange: (tab: AppTabId) => void;
}) {
  const locale = useStore((s) => s.locale);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
      aria-label={t(locale, "appBottomNavAria")}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {APP_BOTTOM_NAV_TABS.map(({ id, icon: Icon, labelKey }) => {
          const selected = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={[
                "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium leading-tight transition-colors",
                selected
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              aria-current={selected ? "page" : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="max-w-full text-center whitespace-normal">{t(locale, labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
