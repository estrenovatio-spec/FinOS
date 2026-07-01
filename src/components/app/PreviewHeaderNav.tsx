"use client";

import {
  BriefcaseBusiness,
  Ellipsis,
  House,
  Bot,
  ChartColumn,
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
  const businessModeEnabled = useStore((s) => s.businessModeEnabled);
  const showBusinessTab = businessModeEnabled;

  return (
    <div className="flex items-center gap-1">
      {active !== "home" ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={t(locale, "appTabHome")}
          onClick={() => onChange("home")}
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
        variant={active === "advisor" ? "default" : "outline"}
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label={t(locale, "appTabAdvisor")}
        aria-current={active === "advisor" ? "page" : undefined}
        onClick={() => onChange("advisor")}
      >
        <Bot className="h-4 w-4" aria-hidden />
      </Button>
      {showBusinessTab ? (
        <Button
          type="button"
          variant={active === "business" ? "default" : "outline"}
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={t(locale, "appTabBusiness")}
          aria-current={active === "business" ? "page" : undefined}
          onClick={() => onChange("business")}
        >
          <BriefcaseBusiness className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      <Button
        type="button"
        variant={active === "more" ? "default" : "outline"}
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label={t(locale, "appTabMore")}
        aria-current={active === "more" ? "page" : undefined}
        onClick={() => onChange("more")}
      >
        <Ellipsis className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
