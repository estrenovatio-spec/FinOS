"use client";

import { ChevronDown, ChevronUp, List, Pencil, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTelegramBackHandler } from "@/hooks/useTelegramBackHandler";
import { HouseholdFilterTabs } from "@/components/HouseholdControls";
import { TransactionEditDialog } from "@/components/TransactionEditDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HomeSectionCardHeader,
  HomeSectionCollapsedBar,
  homeSectionContentClassName,
  homeSectionPadX,
  sectionToggleButtonClassName,
} from "@/components/HomeSectionCardHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCategoryLabel } from "@/lib/categories";
import { OwnerChip } from "@/components/OwnerChip";
import {
  formatTransactionDate,
  formatTransactionDateShort,
  todayIsoDate,
  yesterdayIsoDate,
} from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { t } from "@/lib/i18n";
import {
  TRANSACTIONS_HIDDEN_KEY,
  TRANSACTIONS_TYPE_FILTER_KEY,
} from "@/lib/storage-reset";
import {
  hasPartnerBudget,
  myDisplayName,
  partnerDisplayName,
  partnerTabLabel,
} from "@/lib/owner-labels";
import { cn } from "@/lib/utils";
import { displayTransactionNote } from "@/lib/transaction-note";
import {
  useCategories,
  useFilteredTransactions,
  useStore,
} from "@/store/useStore";
import type { HouseholdFilter, Transaction, TxType } from "@/types";

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(TRANSACTIONS_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(TRANSACTIONS_HIDDEN_KEY, "1");
    else localStorage.removeItem(TRANSACTIONS_HIDDEN_KEY);
  } catch {
    /* ignore */
  }
}

function readTypeFilter(): "all" | TxType {
  if (typeof window === "undefined") return "all";
  try {
    const v = localStorage.getItem(TRANSACTIONS_TYPE_FILTER_KEY);
    if (v === "income" || v === "expense") return v;
  } catch {
    /* ignore */
  }
  return "all";
}

function writeTypeFilter(filter: "all" | TxType): void {
  try {
    if (filter === "all") localStorage.removeItem(TRANSACTIONS_TYPE_FILTER_KEY);
    else localStorage.setItem(TRANSACTIONS_TYPE_FILTER_KEY, filter);
  } catch {
    /* ignore */
  }
}

type TxDayGroup = {
  dateKey: string;
  label: string;
  items: Transaction[];
  incomeTotal: number;
  expenseTotal: number;
};

function groupTransactionsByDay(
  transactions: Transaction[],
  locale: "ru" | "en",
): TxDayGroup[] {
  const today = todayIsoDate();
  const yesterday = yesterdayIsoDate();
  const order: string[] = [];
  const buckets = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const key = tx.date?.slice(0, 10) || today;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(tx);
  }

  return order.map((dateKey) => {
    const items = buckets.get(dateKey) ?? [];
    const incomeTotal = items.reduce(
      (sum, tx) => (tx.type === "income" ? sum + tx.amount : sum),
      0,
    );
    const expenseTotal = items.reduce(
      (sum, tx) => (tx.type === "expense" ? sum + tx.amount : sum),
      0,
    );
    let label = formatTransactionDateShort(dateKey, locale);
    if (dateKey === today) label = t(locale, "txDayToday");
    else if (dateKey === yesterday) label = t(locale, "txDayYesterday");
    return { dateKey, label, items, incomeTotal, expenseTotal };
  });
}

function DayGroupTotals({
  income,
  expense,
  locale,
}: {
  income: number;
  expense: number;
  locale: "ru" | "en";
}) {
  if (income <= 0 && expense <= 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums">
      {income > 0 ? (
        <span className="text-emerald-600">+{formatMoney(income, locale)}</span>
      ) : null}
      {income > 0 && expense > 0 ? (
        <span className="text-muted-foreground">·</span>
      ) : null}
      {expense > 0 ? (
        <span className="text-red-600">−{formatMoney(expense, locale)}</span>
      ) : null}
    </span>
  );
}

type TransactionRowProps = {
  tx: Transaction;
  locale: "ru" | "en";
  categories: ReturnType<typeof useCategories>;
  partnerName: string | null;
  partnerKeywords: string[];
  userName: string | null;
  myChipColor: string;
  partnerChipColor: string;
  householdFilter: HouseholdFilter;
  compactAllTab: boolean;
  showMeta?: boolean;
  todayCompact?: boolean;
  onEdit: (tx: Transaction) => void;
};

function formatTransactionMoment(tx: Transaction, locale: "ru" | "en"): string {
  const raw = tx.date?.trim();
  if (!raw) return "";
  if (!raw.includes("T")) return formatTransactionDate(raw, locale);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return formatTransactionDate(raw, locale);
  const day = raw.slice(0, 10);
  if (day === todayIsoDate()) {
    return date.toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return formatTransactionDate(raw, locale);
}

function TransactionRow({
  tx,
  locale,
  categories,
  partnerName,
  partnerKeywords,
  userName,
  myChipColor,
  partnerChipColor,
  householdFilter,
  compactAllTab,
  showMeta = false,
  todayCompact = false,
  onEdit,
}: TransactionRowProps) {
  const note = displayTransactionNote(tx.note, tx.amount);
  const savingsGoals = useStore((s) => s.savingsGoals);
  const goalName = tx.goalId
    ? savingsGoals.find((g) => g.id === tx.goalId)?.name
    : null;
  const goalPart =
    tx.goalAmount && tx.goalAmount > 0 && goalName
      ? t(locale, "txGoalLinked", {
          name: goalName,
          amount: formatMoney(tx.goalAmount, locale),
        })
      : null;
  const owner = tx.owner === "partner" ? "partner" : "me";
  const showNames = hasPartnerBudget(partnerName, partnerKeywords);
  const meLabel = myDisplayName(locale, userName);
  const partnerLabel =
    partnerDisplayName(partnerName) ||
    partnerTabLabel(locale, partnerName, partnerKeywords);
  const spenderLabel =
    householdFilter === "all" && showNames
      ? owner === "partner"
        ? partnerLabel
        : meLabel
      : null;
  const metaLabel = showMeta ? formatTransactionMoment(tx, locale) : null;

  const leftExtra = [note, goalPart].filter(Boolean);
  const amountClass =
    tx.type === "income"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  const rowClass = todayCompact
    ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-md border border-border/70 py-1 pl-1.5 pr-0.5 text-xs"
    : "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-md border border-border/80 py-1.5 pl-2 pr-1 text-sm";
  const metaClass = todayCompact
    ? "mt-0.5 text-[10px] leading-snug text-muted-foreground"
    : "mt-0.5 text-[11px] leading-snug text-muted-foreground";
  const extraClass = todayCompact
    ? "mt-0.5 line-clamp-1 break-words text-[11px] leading-snug text-muted-foreground"
    : "mt-0.5 line-clamp-1 break-words text-xs leading-snug text-muted-foreground";
  const amountTextClass = todayCompact
    ? "whitespace-nowrap text-xs font-semibold tabular-nums leading-none"
    : "whitespace-nowrap text-sm font-semibold tabular-nums leading-none";
  const editButtonClass = todayCompact
    ? "h-6 w-6 shrink-0"
    : "h-7 w-7 shrink-0";
  const editIconClass = todayCompact ? "h-3 w-3" : "h-3 w-3";

  if (compactAllTab) {
    return (
      <li className={cn(rowClass)}>
        <button
          type="button"
          className="min-w-0 text-left"
          onClick={() => onEdit(tx)}
        >
          <p className="truncate font-medium leading-tight">
            {getCategoryLabel(tx.categoryId, categories, locale)}
          </p>
          {metaLabel ? <p className={metaClass}>{metaLabel}</p> : null}
          {leftExtra.length > 0 ? (
            <p className={extraClass}>{leftExtra.join(" · ")}</p>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-1 self-center">
          {spenderLabel ? (
            <OwnerChip
              label={spenderLabel}
              color={owner === "partner" ? partnerChipColor : myChipColor}
            />
          ) : null}
          <span className={cn(amountTextClass, amountClass)}>
            {tx.type === "income" ? "+" : "−"}
            {formatMoney(tx.amount, locale)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={editButtonClass}
            aria-label={t(locale, "txEdit")}
            onClick={() => onEdit(tx)}
          >
            <Pencil className={editIconClass} />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className={cn(rowClass)}>
      <button
        type="button"
        className="min-w-0 text-left"
        onClick={() => onEdit(tx)}
      >
        <p className="truncate font-medium leading-tight">
          {getCategoryLabel(tx.categoryId, categories, locale)}
        </p>
        {metaLabel ? <p className={metaClass}>{metaLabel}</p> : null}
        {leftExtra.length > 0 ? (
          <p
            className={
              todayCompact
                ? "mt-0.5 line-clamp-1 break-words text-[11px] leading-snug text-foreground/85"
                : "mt-0.5 line-clamp-2 break-words text-xs leading-snug text-foreground/90"
            }
          >
            {leftExtra.join(" · ")}
          </p>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-1 self-center">
        <span className={cn(amountTextClass, amountClass)}>
          {tx.type === "income" ? "+" : "−"}
          {formatMoney(tx.amount, locale)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={editButtonClass}
          aria-label={t(locale, "txEdit")}
          onClick={() => onEdit(tx)}
        >
          <Pencil className={editIconClass} />
        </Button>
      </div>
    </li>
  );
}

export function TransactionList({
  collapsible = true,
  variant = "default",
  limit,
}: {
  collapsible?: boolean;
  variant?: "default" | "today";
  limit?: number;
} = {}) {
  const locale = useStore((s) => s.locale);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const userName = useStore((s) => s.userName);
  const myChipColor = useStore((s) => s.myChipColor);
  const partnerChipColor = useStore((s) => s.partnerChipColor);
  const categories = useCategories();
  const householdFilter = useStore((s) => s.householdFilter);
  const [filter, setFilter] = useState<"all" | TxType>("all");
  const [query, setQuery] = useState("");
  const transactions = useFilteredTransactions(filter);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [hidden, setHidden] = useState(false);
  const [expandedToday, setExpandedToday] = useState(false);
  const todayVariant = variant === "today";

  const compactAllTab = householdFilter === "all";
  const normalizedQuery = query.trim().toLowerCase();
  const searchedTransactions = useMemo(() => {
    if (!normalizedQuery) return transactions;
    return transactions.filter((tx) => {
      const category = getCategoryLabel(
        tx.categoryId,
        categories,
        locale,
      ).toLowerCase();
      const note = (
        displayTransactionNote(tx.note, tx.amount) ?? ""
      ).toLowerCase();
      const amount = String(tx.amount);
      const date = tx.date?.slice(0, 10) ?? "";
      return (
        category.includes(normalizedQuery) ||
        note.includes(normalizedQuery) ||
        amount.includes(normalizedQuery) ||
        date.includes(normalizedQuery)
      );
    });
  }, [categories, locale, normalizedQuery, transactions]);
  const searchedDayGroups = useMemo(
    () => groupTransactionsByDay(searchedTransactions, locale),
    [locale, searchedTransactions],
  );
  const hasMoreTodayItems = Boolean(
    limit && searchedTransactions.length > limit,
  );
  const todayItems = useMemo(
    () =>
      todayVariant && limit && !expandedToday
        ? searchedTransactions.slice(0, limit)
        : searchedTransactions,
    [expandedToday, limit, searchedTransactions, todayVariant],
  );

  useEffect(() => {
    if (todayVariant) {
      setHidden(false);
      setFilter("all");
      setExpandedToday(false);
      return;
    }
    setHidden(collapsible ? readHidden() : false);
    setFilter(readTypeFilter());
  }, [collapsible, todayVariant]);

  const onTypeFilterChange = useCallback((value: string) => {
    const next = value as "all" | TxType;
    setFilter(next);
    writeTypeFilter(next);
  }, []);

  const show = useCallback(() => {
    setHidden(false);
    writeHidden(false);
  }, []);

  const hide = useCallback(() => {
    setHidden(true);
    writeHidden(true);
  }, []);

  const handleTelegramBack = useCallback(() => {
    if (editing) {
      setEditing(null);
      return true;
    }
    return false;
  }, [editing]);

  useTelegramBackHandler(handleTelegramBack, editing !== null);

  const rowProps = {
    locale,
    categories,
    partnerName,
    partnerKeywords,
    userName,
    myChipColor,
    partnerChipColor,
    householdFilter,
    compactAllTab,
    todayCompact: todayVariant,
    onEdit: setEditing,
  };

  if (todayVariant) {
    return (
      <div data-onboarding="transactions">
        <Card className="border-border/25 bg-card/90 shadow-none">
          <HomeSectionCardHeader
            icon={List}
            title={locale === "ru" ? "Последние операции" : "Latest entries"}
          />
          <CardContent className={`space-y-1 ${homeSectionContentClassName}`}>
            {todayItems.length === 0 ? (
              <p className="py-1.5 text-center text-sm text-muted-foreground">
                {locale === "ru" ? "Пока нет операций" : "No entries yet"}
              </p>
            ) : (
              <>
                <ul className="space-y-0.5">
                  {todayItems.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      {...rowProps}
                      showMeta
                    />
                  ))}
                </ul>
                {hasMoreTodayItems ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 w-full text-xs"
                    onClick={() => setExpandedToday((value) => !value)}
                  >
                    {expandedToday
                      ? locale === "ru"
                        ? "Свернуть"
                        : "Show less"
                      : locale === "ru"
                        ? "Показать ещё"
                        : "Show more"}
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <TransactionEditDialog
          transaction={editing}
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      </div>
    );
  }

  const groupedList = (
    <div className="max-h-72 space-y-3 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
      {searchedDayGroups.map((group) => (
        <section key={group.dateKey} className="space-y-1">
          <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-card/95 py-0.5 text-xs font-semibold text-muted-foreground backdrop-blur-sm">
            <span>{group.label}</span>
            <DayGroupTotals
              income={group.incomeTotal}
              expense={group.expenseTotal}
              locale={locale}
            />
          </div>
          <ul className="space-y-1">
            {group.items.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} {...rowProps} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );

  if (collapsible && hidden) {
    return (
      <div data-onboarding="transactions">
        <HomeSectionCollapsedBar
          icon={List}
          title={t(locale, "transactions")}
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={sectionToggleButtonClassName}
              onClick={show}
            >
              <ChevronDown className="h-4 w-4" />
              {t(locale, "transactionsShow")}
            </Button>
          }
        />
        <TransactionEditDialog
          transaction={editing}
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      </div>
    );
  }

  return (
    <div data-onboarding="transactions">
      <Card className="border-primary/20">
        <HomeSectionCardHeader
          icon={List}
          title={t(locale, "transactions")}
          action={
            collapsible ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={sectionToggleButtonClassName}
                onClick={hide}
              >
                <ChevronUp className="h-4 w-4" />
                {t(locale, "transactionsHide")}
              </Button>
            ) : null
          }
        />
        <CardHeader className={`space-y-3 pb-2 pt-0 ${homeSectionPadX}`}>
          <Tabs value={filter} onValueChange={onTypeFilterChange}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">
                {t(locale, "filterAll")}
              </TabsTrigger>
              <TabsTrigger value="income" className="flex-1">
                {t(locale, "filterIncome")}
              </TabsTrigger>
              <TabsTrigger value="expense" className="flex-1">
                {t(locale, "filterExpense")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className={`space-y-3 ${homeSectionContentClassName}`}>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t(locale, "householdFilterLabel")}
            </p>
            <HouseholdFilterTabs />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    locale === "ru"
                      ? "Поиск по операциям"
                      : "Search transactions"
                  }
                  className="h-10 pl-9 pr-9"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label={
                      locale === "ru" ? "Очистить поиск" : "Clear search"
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setQuery("")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {searchedTransactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {query
                ? locale === "ru"
                  ? "Ничего не найдено"
                  : "Nothing found"
                : t(locale, "noTransactions")}
            </p>
          ) : (
            groupedList
          )}
        </CardContent>
      </Card>

      <TransactionEditDialog
        transaction={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </div>
  );
}
