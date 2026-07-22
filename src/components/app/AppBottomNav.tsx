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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/92 backdrop-blur-xl supports-[backdrop-filter]:bg-background/84"
      style={{
        minHeight: "calc(var(--app-bottom-nav-height) + max(env(safe-area-inset-bottom), 0px))",
        paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
      }}
      aria-label={t(locale, "appBottomNavAria")}
    >
      <div className="mx-auto grid min-h-[var(--app-bottom-nav-height)] max-w-lg grid-cols-5">
        {APP_BOTTOM_NAV_TABS.map(({ id, icon: Icon, labelKey }) => {
          const selected = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={[
                "flex min-h-[var(--app-bottom-nav-height)] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium leading-tight transition-all duration-150 sm:px-1.5",
                selected
                  ? "bg-foreground/[0.04] text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              aria-current={selected ? "page" : undefined}
            >
              <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" aria-hidden />
              <span className="max-w-full text-center whitespace-normal">{t(locale, labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
