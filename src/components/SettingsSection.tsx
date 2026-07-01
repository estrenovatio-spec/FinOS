"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SettingsSectionProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  /** default — карточка; nested — блок внутри секции; danger — опасные действия */
  variant?: "default" | "nested" | "danger";
  className?: string;
};

export function SettingsSection({
  title,
  description,
  children,
  variant = "default",
  className,
}: SettingsSectionProps) {
  const hasHeader = Boolean(title || description);

  return (
    <section
      className={cn(
        "space-y-3",
        variant === "danger" &&
          "rounded-xl border-2 border-destructive/25 bg-destructive/5 p-4 shadow-sm",
        variant === "default" &&
          "rounded-xl border-2 border-border/80 bg-card p-4 shadow-sm",
        variant === "nested" &&
          "rounded-lg border-2 border-dashed border-border/70 bg-muted/25 p-3",
        className,
      )}
    >
      {hasHeader ? (
        <header className="space-y-1 border-b-2 border-border/60 pb-2.5">
          {title ? (
            <h3
              className={cn(
                "text-sm font-semibold tracking-tight",
                variant === "danger" && "text-destructive",
              )}
            >
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </header>
      ) : null}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
