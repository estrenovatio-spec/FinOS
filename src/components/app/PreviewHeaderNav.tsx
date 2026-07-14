"use client";

import {
  ChartColumn,
  House,
  Settings,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppTabId } from "@/lib/app-bottom-nav";
import { t } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

export function PreviewHeaderNav({
  active,
  onChange,
}: {
  active: AppTabId;
  onChange: (tab: AppTabId) => void;
}) {
  const locale = useStore((s) => s.locale);

  return (
    <div className="flex items-center gap-1">
      {active !== "today" ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={t(locale, "appTabHome")}
          onClick={() => onChange("today")}
        >
          <House className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      <Button
        type="button"
        variant={active === "operations" ? "default" : "outline"}
        size="sm"
        className="h-8 min-w-[5.75rem] px-2 font-semibold"
        aria-label={t(locale, "appTabSummary")}
        aria-current={active === "operations" ? "page" : undefined}
        onClick={() => onChange("operations")}
      >
        <ChartColumn className="mr-1 h-4 w-4" aria-hidden />
        {t(locale, "appTabSummary")}
      </Button>
      <Button
        type="button"
        variant={active === "forecast" ? "default" : "outline"}
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label={t(locale, "appTabAdvisor")}
        aria-current={active === "forecast" ? "page" : undefined}
        onClick={() => onChange("forecast")}
      >
        <ChartColumn className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant={active === "plan" ? "default" : "outline"}
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label={t(locale, "appTabBusiness")}
        aria-current={active === "plan" ? "page" : undefined}
        onClick={() => onChange("plan")}
      >
        <Target className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant={active === "settings" ? "default" : "outline"}
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label={t(locale, "appTabMore")}
        aria-current={active === "settings" ? "page" : undefined}
        onClick={() => onChange("settings")}
      >
        <Settings className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
