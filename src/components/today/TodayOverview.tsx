"use client";

import { CalendarClock, CircleDollarSign, PiggyBank, Wallet } from "lucide-react";
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
          return (
            <Card
              key={item.id}
              className={`border-border/25 bg-card/95 shadow-none ${
                item.layout === "wide" ? "md:col-span-3" : ""
              }`}
            >
              <CardContent className="space-y-2 p-4">
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4 shrink-0" />
                  <p className="text-xs font-medium uppercase tracking-[0.14em]">
                    {item.label}
                  </p>
                </div>
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
                {item.actionLabel && item.actionKey ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto justify-start self-start px-0 py-0 text-xs font-medium text-muted-foreground hover:text-foreground"
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
