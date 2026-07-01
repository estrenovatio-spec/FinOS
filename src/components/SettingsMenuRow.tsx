"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsMenuRow({
  title,
  description,
  badge,
  danger,
  onClick,
}: {
  title?: string;
  description?: string;
  badge?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  const label = title?.trim() || description?.trim() || "";
  const sub = title?.trim() && description?.trim() ? description : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors",
        danger
          ? "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
          : "border-border/80 bg-card hover:bg-muted/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "text-sm font-semibold",
              !title?.trim() && "text-muted-foreground",
              danger && "text-destructive",
            )}
          >
            {label}
          </p>
          {badge ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-200">
              {badge}
            </span>
          ) : null}
        </div>
        {sub ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{sub}</p>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
