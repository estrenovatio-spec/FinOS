"use client";

import { ChevronDown, ChevronUp, CalendarClock, CircleDollarSign, PiggyBank, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TodayOverviewItem } from "@/components/today/today-screen-presenter";

function iconForItem(id: TodayOverviewItem["id"]) {
  switch (id) {
    case "current-balance":
      return Wallet;
    case "payments":
      return CalendarClock;
    case "next-payment":
      return CalendarClock;
    case "allowed":
      return Wallet;
    case "planned-free-money":
      return PiggyBank;
    case "reserve":
      return PiggyBank;
    case "safe-until":
      return CircleDollarSign;
  }
}

export function TodayOverview({
  title,
  items,
  onItemAction,
}: {
  title: string;
  items: TodayOverviewItem[];
  onItemAction?: (actionKey: NonNullable<TodayOverviewItem["actionKey"]>) => void;
}) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {items.map((item) => {
          const Icon = iconForItem(item.id);
          if (!Icon) return null;
          const expandable = Boolean(item.details && item.details.length > 0);
          const expanded = expandedItemId === item.id;
          const Chevron = expanded ? ChevronUp : ChevronDown;
          return (
            <Card
              key={item.id}
              className={`border-border/25 bg-card/95 shadow-none ${
                item.layout === "wide" ? "md:col-span-3" : ""
              }`}
            >
              <CardContent className="space-y-2 p-4">
                {expandable ? (
                  <button
                    type="button"
                    className="w-full space-y-2 text-left"
                    onClick={() =>
                      setExpandedItemId((current) => (current === item.id ? null : item.id))
                    }
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                          <Icon className="h-4 w-4 shrink-0" />
                          <p className="text-xs font-medium uppercase tracking-[0.14em]">
                            {item.label}
                          </p>
                        </div>
                        {item.subtitle ? (
                          <p className="text-xs font-medium text-muted-foreground">{item.subtitle}</p>
                        ) : null}
                        <p className="text-lg font-semibold leading-tight text-foreground">
                          {item.value}
                        </p>
                      </div>
                      <Chevron className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    {item.caption ? (
                      <p className="text-xs leading-snug text-muted-foreground">{item.caption}</p>
                    ) : null}
                    {expanded && item.details ? (
                      <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
                        {item.details.map((detail, index) => {
                          const toneClassName =
                            detail.tone === "positive"
                              ? "text-emerald-700 dark:text-emerald-300"
                              : detail.tone === "negative"
                                ? "text-foreground"
                                : detail.tone === "total"
                                  ? "font-semibold text-foreground"
                                  : "text-foreground";
                          return (
                            <div key={`${item.id}-detail-${index}`}>
                              {detail.tone === "total" ? (
                                <div className="border-t border-border/70 pt-2" />
                              ) : null}
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 text-sm">
                                <p className="break-words text-muted-foreground">{detail.label}</p>
                                <p className={`shrink-0 whitespace-nowrap text-right ${toneClassName}`}>
                                  {detail.value}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </button>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <Icon className="h-4 w-4 shrink-0" />
                      <p className="text-xs font-medium uppercase tracking-[0.14em]">
                        {item.label}
                      </p>
                    </div>
                    {item.subtitle ? (
                      <p className="text-xs font-medium text-muted-foreground">{item.subtitle}</p>
                    ) : null}
                    <div className="space-y-2">
                      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                        <p className="text-lg font-semibold leading-tight text-foreground">
                          {item.value}
                        </p>
                      </div>
                    </div>
                    {item.caption ? (
                      <p className="text-xs leading-snug text-muted-foreground">
                        {item.caption}
                      </p>
                    ) : null}
                  </>
                )}
                {item.actionLabel && item.actionKey ? (
                  <Button
                    type="button"
                    variant={item.actionVariant === "primary" ? "default" : "ghost"}
                    size={item.actionVariant === "primary" ? "default" : "sm"}
                    className={
                      item.actionVariant === "primary"
                        ? "mt-1 h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                        : "h-auto justify-start self-start px-0 py-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                    }
                    aria-label={`${item.actionLabel}: ${item.label}`}
                    onClick={() => onItemAction?.(item.actionKey!)}
                  >
                    {item.actionLabel}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
