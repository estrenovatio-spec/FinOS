"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CardHeader, CardTitle } from "@/components/ui/card";

/** Horizontal padding for all home blocks — matches collapsed strip */
export const homeSectionPadX = "px-3";

export const homeSectionContentClassName = `${homeSectionPadX} pb-4 pt-0`;

const titleClass =
  "m-0 flex min-w-0 items-center gap-2.5 p-0 text-[1.02rem] font-semibold leading-6 tracking-[-0.018em]";

/** Hide / Show buttons on home section cards */
export const sectionToggleButtonClassName = "h-8 shrink-0 gap-1 px-1.5 text-sm";

type HomeSectionCardHeaderProps = {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  subtitle?: string;
};

export function HomeSectionCardHeader({
  icon: Icon,
  title,
  action,
  subtitle,
}: HomeSectionCardHeaderProps) {
  return (
    <CardHeader
      className={`flex flex-row items-center justify-between gap-3 space-y-0 py-3 ${homeSectionPadX}`}
    >
      <div className="min-w-0 flex-1">
        <CardTitle className={titleClass}>
          <Icon className="h-[1.05rem] w-[1.05rem] shrink-0 text-foreground/70" />
          <span className="truncate">{title}</span>
        </CardTitle>
        {subtitle ? (
          <p className="mt-1 text-[13px] font-normal leading-5 text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </CardHeader>
  );
}

/** Collapsed section strip — same icon + weight as expanded header */
export function HomeSectionCollapsedBar({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-border/80 bg-card/92 px-4 py-3 shadow-[var(--surface-shadow-soft)]">
      <span className="flex min-w-0 items-center gap-2.5 text-[1.02rem] font-semibold leading-6 tracking-[-0.018em]">
        <Icon className="h-[1.05rem] w-[1.05rem] shrink-0 text-foreground/70" />
        <span className="truncate">{title}</span>
      </span>
      {action}
    </div>
  );
}
