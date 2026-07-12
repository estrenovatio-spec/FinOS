"use client";

import { ShieldAlert, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TodaySecondaryInsightView } from "@/components/today/today-screen-presenter";

function SecondaryCard({
  icon: Icon,
  title,
  value,
  caption,
}: {
  icon: typeof ShieldAlert;
  title: string;
  value: string;
  caption?: string | null;
}) {
  return (
    <Card className="border-border/25 bg-card/95 shadow-none">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        <p className="text-sm leading-snug text-foreground">{value}</p>
        {caption ? (
          <p className="text-xs leading-snug text-muted-foreground">{caption}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TodaySecondaryInsights({
  avoid,
  peaceIndex,
}: {
  avoid: TodaySecondaryInsightView | null;
  peaceIndex: TodaySecondaryInsightView | null;
}) {
  if (!avoid && !peaceIndex) return null;

  return (
    <div className="space-y-2">
      {avoid ? (
        <SecondaryCard
          icon={ShieldAlert}
          title={avoid.title}
          value={avoid.value}
          caption={avoid.caption}
        />
      ) : null}
      {peaceIndex ? (
        <SecondaryCard
          icon={Sparkles}
          title={peaceIndex.title}
          value={peaceIndex.value}
          caption={peaceIndex.caption}
        />
      ) : null}
    </div>
  );
}
