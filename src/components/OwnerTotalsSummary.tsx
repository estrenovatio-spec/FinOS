"use client";

import { ChevronDown, ChevronUp, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format-money";
import { t } from "@/lib/i18n";
import {
  hasPartnerBudget,
  myDisplayName,
  partnerDisplayName,
  partnerTabLabel,
} from "@/lib/owner-labels";
import {
  SUMMARY_EXPENSE_HIDDEN_KEY,
  SUMMARY_INCOME_HIDDEN_KEY,
} from "@/lib/storage-reset";
import { useOwnerTypeTotals, useStore, useTypeCategoryBreakdown } from "@/store/useStore";
import type { TxType } from "@/types";

const DAYS = 30;

function readHidden(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeHidden(key: string, hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

type RowProps = {
  label: string;
  amount: number;
  locale: "ru" | "en";
  variant: "income" | "expense";
};

function AmountRow({ label, amount, locale, variant }: RowProps) {
  const fmt = formatMoney(amount, locale);
  const color =
    variant === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${color}`}>
        {fmt} {t(locale, "currency")}
      </span>
    </div>
  );
}

type CategoryListProps = {
  items: { category: string; value: number }[];
  total: number;
  locale: "ru" | "en";
  variant: "income" | "expense";
};

function CategoryList({ items, total, locale, variant }: CategoryListProps) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t(locale, "summaryCategoriesEmpty")}</p>
    );
  }

  const color =
    variant === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

  return (
    <ul className="space-y-1.5 border-t pt-2">
      {items.map((row, index) => {
        const fmt = formatMoney(row.value, locale);
        const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
        return (
          <li key={row.category} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">
              <span className="mr-1.5 tabular-nums text-foreground/50">{index + 1}.</span>
              {row.category}
            </span>
            <span className={`shrink-0 tabular-nums font-medium ${color}`}>
              {fmt} {pct > 0 ? `(${pct}%)` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type SectionProps = {
  storageKey: string;
  title: string;
  icon: ReactNode;
  variant: "income" | "expense";
  txType: TxType;
  meLabel: string;
  partnerLabel: string;
  meAmount: number;
  partnerAmount: number;
  showPartner: boolean;
};

function CollapsibleTotalsSection({
  storageKey,
  title,
  icon,
  variant,
  txType,
  meLabel,
  partnerLabel,
  meAmount,
  partnerAmount,
  showPartner,
}: SectionProps) {
  const locale = useStore((s) => s.locale);
  const [hidden, setHidden] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const categories = useTypeCategoryBreakdown(DAYS, txType);
  const total = meAmount + partnerAmount;
  const primaryAmount = showPartner ? meAmount : total;
  const primaryLabel = showPartner ? meLabel : t(locale, "filterAll");

  useEffect(() => {
    setHidden(readHidden(storageKey));
  }, [storageKey]);

  const show = useCallback(() => {
    setHidden(false);
    writeHidden(storageKey, false);
  }, [storageKey]);

  const hide = useCallback(() => {
    setHidden(true);
    writeHidden(storageKey, true);
  }, [storageKey]);

  if (hidden) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={show}>
          <ChevronDown className="h-4 w-4" />
          {t(locale, "summaryShow")}
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          {icon}
          <span className="truncate">{title}</span>
        </CardTitle>
        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs" onClick={hide}>
          <ChevronUp className="h-4 w-4" />
          {t(locale, "summaryHide")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <AmountRow label={primaryLabel} amount={primaryAmount} locale={locale} variant={variant} />
        {showPartner && (
          <AmountRow label={partnerLabel} amount={partnerAmount} locale={locale} variant={variant} />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 w-full text-xs"
          onClick={() => setShowCategories((v) => !v)}
        >
          {showCategories ? t(locale, "summaryHideCategories") : t(locale, "summaryByCategories")}
        </Button>
        {showCategories && (
          <CategoryList items={categories} total={total} locale={locale} variant={variant} />
        )}
      </CardContent>
    </Card>
  );
}

/** Income & expense totals by owner — after the category chart */
export function OwnerTotalsSummary() {
  const locale = useStore((s) => s.locale);
  const userName = useStore((s) => s.userName);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const totals = useOwnerTypeTotals(DAYS);

  const showPartner = hasPartnerBudget(partnerName, partnerKeywords);
  const partnerLabel =
    partnerDisplayName(partnerName) ||
    partnerTabLabel(locale, partnerName, partnerKeywords);
  const meLabel = myDisplayName(locale, userName);

  return (
    <div className="space-y-3">
      <CollapsibleTotalsSection
        storageKey={SUMMARY_EXPENSE_HIDDEN_KEY}
        title={t(locale, "summaryExpenseTitle")}
        icon={<TrendingDown className="h-4 w-4 shrink-0 text-rose-500" />}
        variant="expense"
        txType="expense"
        meLabel={meLabel}
        partnerLabel={partnerLabel}
        meAmount={totals.me.expense}
        partnerAmount={totals.partner.expense}
        showPartner={showPartner}
      />
      <CollapsibleTotalsSection
        storageKey={SUMMARY_INCOME_HIDDEN_KEY}
        title={t(locale, "summaryIncomeTitle")}
        icon={<TrendingUp className="h-4 w-4 shrink-0 text-emerald-500" />}
        variant="income"
        txType="income"
        meLabel={meLabel}
        partnerLabel={partnerLabel}
        meAmount={totals.me.income}
        partnerAmount={totals.partner.income}
        showPartner={showPartner}
      />
    </div>
  );
}
