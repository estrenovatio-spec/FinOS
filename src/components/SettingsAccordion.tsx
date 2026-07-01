"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SettingsAccordionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  variant?: "default" | "nested" | "danger";
};

export function SettingsAccordion({
  title,
  description,
  children,
  defaultOpen = false,
  variant = "default",
}: SettingsAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border-2 shadow-sm",
        variant === "danger" && "border-destructive/25 bg-destructive/5",
        variant === "default" && "border-border/80 bg-card",
        variant === "nested" && "border-dashed border-border/70 bg-muted/25",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "text-sm font-semibold tracking-tight",
              variant === "danger" && "text-destructive",
            )}
          >
            {title}
          </h3>
          {description && !open ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-3 border-t-2 border-border/60 px-4 pb-4 pt-3">{children}</div>
      ) : null}
    </section>
  );
}
