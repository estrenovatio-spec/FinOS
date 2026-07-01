"use client";

import { CalendarClock, PiggyBank, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format-money";
import { useBudgetPeriod, usePeriodOwnerTotals, useStore } from "@/store/useStore";

function dayDiff(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T12:00:00`).getTime();
  const to = new Date(`${toIso}T12:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 1;
  return Math.max(1, Math.ceil((to - from) / (24 * 60 * 60 * 1000)) + 1);
}

export function HomeMoneyPulseCard() {
  const locale = useStore((s) => s.locale);
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const period = useBudgetPeriod();
  const totals = usePeriodOwnerTotals();

  const totalIncome = totals.me.income + totals.partner.income;
  const totalExpense = totals.me.expense + totals.partner.expense;
  const freeMoney = Math.max(0, totalIncome - totalExpense);
  const freePerDay = Math.floor(freeMoney / Math.max(1, dayDiff(new Date().toISOString().slice(0, 10), period.to)));
  const daysLeft = dayDiff(new Date().toISOString().slice(0, 10), period.to);
  const daysTotal = dayDiff(period.from, period.to);
  const daysPassed = Math.max(0, daysTotal - daysLeft);
  const dayProgress = Math.min(100, Math.round((daysPassed / daysTotal) * 100));
  const moneyProgress = totalIncome > 0 ? Math.min(100, Math.round((totalExpense / totalIncome) * 100)) : 0;

  const labels =
    locale === "ru"
      ? {
          title: "Мой финансовый пульс",
          subtitle: "Коротко, без лишних цифр",
          untilSalary: "До конца периода",
          freeMoney: "Свободных денег",
          perDay: "Можно тратить сегодня",
          empty: "Запишите первую операцию, и здесь появится пульс.",
        }
      : {
          title: "My financial pulse",
          subtitle: "Short and to the point",
          untilSalary: "Until period end",
          freeMoney: "Free money",
          perDay: "Spendable today",
          empty: "Add your first transaction and the pulse will appear here.",
        };

  const hasData = totalIncome > 0 || totalExpense > 0;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.subtitle}
            </p>
            <h3 className="mt-0.5 text-sm font-semibold text-foreground">{labels.title}</h3>
          </div>
          <div className="rounded-md bg-background/70 px-2 py-1 text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {locale === "ru" ? "Период" : "Period"}
            </p>
            <p className="text-xs font-medium text-foreground">
              {period.monthStartDay === 1 ? "1+" : `${budgetMonthStartDay}+`}
            </p>
          </div>
        </div>

        {hasData ? (
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {labels.untilSalary}
                </span>
                <span className="font-semibold tabular-nums text-foreground">{daysLeft} d</span>
              </div>
              <div className="h-2 rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-foreground/75"
                  style={{ width: `${dayProgress}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <PiggyBank className="h-3.5 w-3.5" />
                  {labels.freeMoney}
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatMoney(freeMoney, locale)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${moneyProgress}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-md bg-background/70 px-2 py-1.5 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                {labels.perDay}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatMoney(Math.max(0, freePerDay), locale)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs leading-snug text-muted-foreground">{labels.empty}</p>
        )}
      </CardContent>
    </Card>
  );
}
