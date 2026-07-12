"use client";

import { CalendarClock, CircleDollarSign, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TodayOverviewItem } from "@/components/today/today-screen-presenter";

function iconForItem(id: TodayOverviewItem["id"]) {
  switch (id) {
    case "payments":
      return CalendarClock;
    case "next-risk":
      return CalendarClock;
    case "allowed":
      return Wallet;
    case "safe-until":
      return CircleDollarSign;
  }
}

export function TodayOverview({
  title,
  items,
}: {
  title: string;
  items: TodayOverviewItem[];
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
            <Card key={item.id} className="border-border/25 bg-card/95 shadow-none">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  <p className="text-xs font-medium uppercase tracking-[0.14em]">
                    {item.label}
                  </p>
                </div>
                <p className="text-lg font-semibold leading-tight text-foreground">
                  {item.value}
                </p>
                {item.caption ? (
                  <p className="text-xs leading-snug text-muted-foreground">
                    {item.caption}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
