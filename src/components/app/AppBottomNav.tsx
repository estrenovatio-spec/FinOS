"use client";

import {
  CircleDollarSign,
  Ellipsis,
  Flag,
  Layers3,
  List,
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
  { id: "today", icon: Layers3, labelKey: "appTabHome" },
  { id: "operations", icon: List, labelKey: "appTabSummary" },
  { id: "forecast", icon: Flag, labelKey: "appTabAdvisor" },
  { id: "plan", icon: CircleDollarSign, labelKey: "appTabBusiness" },
  { id: "settings", icon: Ellipsis, labelKey: "appTabMore" },
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 shadow-[0_-8px_24px_rgba(70,53,37,0.025)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/88"
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
                  ? "text-primary"
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
