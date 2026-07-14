"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCategoryLabel, sortCategoriesByLabel } from "@/lib/categories";
import { buildMoneySetupProgress } from "@/components/today/money-setup-progress";
import {
  MONEY_SETUP_INCOME_SOURCE_KINDS,
  type MoneySetupIncomeRecurrence,
  type MoneySetupIncomeSource,
  type MoneySetupIncomeSourceKind,
} from "@/lib/money-setup";
import {
  buildIncomeSetupSavePayload,
  emptyIncomeSourceDraft,
  getPrimaryIncomeSourceDraft,
  hasLegacyIncomeSetup,
  startIncomeSourcesEditing,
  toIncomeSourceDraft,
  type IncomeSourceDraft,
} from "@/components/today/income-sources-helpers";
import { useToast } from "@/components/ui/toast";
import { useHouseholdBalances, useStore } from "@/store/useStore";

export type MoneySetupInitialSection =
  | "balance"
  | "current_balance"
  | "income"
  | "required_expenses"
  | "essential_budgets";

export type MoneySetupBalanceSectionView = {
  title: string;
  prompt: string;
  inputLabel: string;
  currentAmountNote: string;
  showInlineSaveButton: boolean;
  completionLabel: string | null;
};

type MoneySetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showHouseholdToggle: boolean;
  initialSection?: MoneySetupInitialSection | null;
};

const ESSENTIAL_PRIORITY_IDS = [
  "groceries",
  "transport",
  "health",
  "kids_family",
  "household_supplies",
  "shopping",
];

const ESSENTIAL_EXCLUDED_KEYWORDS = ["recurring", "regular", "subscription", "subscriptions", "регуляр"] as const;

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function parseBalanceAmount(value: string): number | null {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

function isServiceEssentialCategory(
  categoryId: string,
  label: string,
): boolean {
  const haystack = `${categoryId} ${label}`.toLocaleLowerCase("ru-RU");
  return ESSENTIAL_EXCLUDED_KEYWORDS.some((keyword) =>
    haystack.includes(keyword),
  );
}

function normalizeMoneySetupInitialSection(
  section: MoneySetupInitialSection | null | undefined,
): "balance" | "income" | "essential_budgets" | null {
  if (section === "current_balance") return "balance";
  if (section === "required_expenses") return "essential_budgets";
  return section ?? null;
}

export function buildMoneySetupBalanceSectionView(args: {
  locale: "ru" | "en";
  initialSection: MoneySetupInitialSection | null | undefined;
  currentAvailableBalance: number;
  isCompleted: boolean;
}): MoneySetupBalanceSectionView {
  const normalizedInitialSection = normalizeMoneySetupInitialSection(args.initialSection);

  return {
    title: args.locale === "ru" ? "Текущий остаток" : "Current balance",
    prompt:
      args.locale === "ru"
        ? "Сколько денег сейчас доступно?"
        : "How much money is available right now?",
    inputLabel: args.locale === "ru" ? "Доступно сейчас" : "Available now",
    currentAmountNote:
      args.locale === "ru"
        ? `Сейчас в расчёте: ${args.currentAvailableBalance} ₽`
        : `Currently in use: ${args.currentAvailableBalance} RUB`,
    showInlineSaveButton: normalizedInitialSection === "balance",
    completionLabel: args.isCompleted
      ? args.locale === "ru"
        ? "Заполнено"
        : "Completed"
      : null,
  };
}

export function MoneySetupDialog({
  open,
  onOpenChange,
  showHouseholdToggle,
  initialSection = null,
}: MoneySetupDialogProps) {
  const locale = useStore((s) => s.locale);
  const moneySetup = useStore((s) => s.moneySetup);
  const categories = useStore((s) => s.categories);
  const updateMoneySetup = useStore((s) => s.updateMoneySetup);
  const setActualCash = useStore((s) => s.setActualCash);
  const balances = useHouseholdBalances();
  const { toast } = useToast();

  const categoryOptions = useMemo(() => {
    const expenseCategories = sortCategoriesByLabel(
      categories.filter((category) => {
        if (category.type !== "expense") return false;
        const label = getCategoryLabel(category.id, categories, locale);
        return !isServiceEssentialCategory(category.id, label);
      }),
      categories,
      locale,
    );
    const priority = new Map(
      ESSENTIAL_PRIORITY_IDS.map((id, index) => [id, index]),
    );
    return [...expenseCategories].sort((a, b) => {
      const aPriority = priority.get(a.id);
      const bPriority = priority.get(b.id);
      if (aPriority != null && bPriority != null) return aPriority - bPriority;
      if (aPriority != null) return -1;
      if (bPriority != null) return 1;
      return getCategoryLabel(a.id, categories, locale).localeCompare(
        getCategoryLabel(b.id, categories, locale),
        locale === "ru" ? "ru" : "en",
      );
    });
  }, [categories, locale]);

  const [nextIncomeDate, setNextIncomeDate] = useState("");
  const [expectedIncomeAmount, setExpectedIncomeAmount] = useState("");
  const [showIncomeSources, setShowIncomeSources] = useState(false);
  const [incomeSources, setIncomeSources] = useState<IncomeSourceDraft[]>([]);
  const [confirmResetIncomeSources, setConfirmResetIncomeSources] =
    useState(false);
  const [essentialCategoryIds, setEssentialCategoryIds] = useState<string[]>(
    [],
  );
  const [useHouseholdBalance, setUseHouseholdBalance] = useState(false);
  const [currentBalanceInput, setCurrentBalanceInput] = useState("");
  const incomeSectionRef = useRef<HTMLDivElement | null>(null);
  const balanceSectionRef = useRef<HTMLDivElement | null>(null);
  const essentialCategoriesSectionRef = useRef<HTMLDivElement | null>(null);
  const currentBalanceInputRef = useRef<HTMLInputElement | null>(null);
  const incomeDateInputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);

  const incomeKindOptions = useMemo(
    () =>
      MONEY_SETUP_INCOME_SOURCE_KINDS.map((kind) => ({
        value: kind,
        label:
          locale === "ru"
            ? kind === "salary"
              ? "Зарплата"
              : kind === "advance"
                ? "Аванс"
                : kind === "rent"
                  ? "Аренда"
                  : kind === "freelance" || kind === "business"
                    ? "Бизнес"
                    : kind === "passive"
                      ? "Пассивный доход"
                      : "Другое"
            : kind === "salary"
              ? "Salary"
              : kind === "advance"
                ? "Advance"
                : kind === "rent"
                  ? "Rent"
                  : kind === "freelance" || kind === "business"
                    ? "Business"
                    : kind === "passive"
                      ? "Passive income"
                      : "Other",
      })).filter((option, index, options) => {
        if (option.value !== "freelance") return true;
        return !options.some((candidate) => candidate.value === "business");
      }),
    [locale],
  );
  const incomeRecurrenceOptions = useMemo(
    () =>
      [
        {
          value: "monthly" as MoneySetupIncomeRecurrence,
          label: locale === "ru" ? "Каждый месяц" : "Every month",
        },
        {
          value: "once" as MoneySetupIncomeRecurrence,
          label: locale === "ru" ? "Один раз" : "One time",
        },
      ] satisfies Array<{ value: MoneySetupIncomeRecurrence; label: string }>,
    [locale],
  );
  const progress = useMemo(
    () => buildMoneySetupProgress({ locale, moneySetup, balances }),
    [balances, locale, moneySetup],
  );
  const normalizedInitialSection = normalizeMoneySetupInitialSection(initialSection);
  const currentAvailableBalance = useHouseholdBalance ? balances.all : balances.me;
  const isBalanceCompleted =
    progress.items.find((item) => item.id === "balance")?.done ?? false;
  const balanceSectionView = useMemo(
    () =>
      buildMoneySetupBalanceSectionView({
        locale,
        initialSection,
        currentAvailableBalance,
        isCompleted: isBalanceCompleted,
      }),
    [currentAvailableBalance, initialSection, isBalanceCompleted, locale],
  );

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setNextIncomeDate(moneySetup.nextIncomeDate ?? "");
    setExpectedIncomeAmount(
      moneySetup.expectedIncomeAmount != null
        ? String(moneySetup.expectedIncomeAmount)
        : "",
    );
    setShowIncomeSources(moneySetup.incomeSources.length > 0);
    setIncomeSources(moneySetup.incomeSources.map(toIncomeSourceDraft));
    setConfirmResetIncomeSources(false);
    setEssentialCategoryIds(moneySetup.essentialCategoryIds);
    setUseHouseholdBalance(moneySetup.useHouseholdBalance);
    setCurrentBalanceInput(String(moneySetup.useHouseholdBalance ? balances.all : balances.me));
  }, [balances.all, balances.me, moneySetup, open]);

  const visibleIncomeSources = useMemo(() => {
    if (showIncomeSources) {
      return incomeSources;
    }
    if (moneySetup.incomeSources.length > 0) {
      return moneySetup.incomeSources.map((source) => ({
        id: source.id,
        label: source.label,
        expectedDate: source.expectedDate ?? "",
        expectedAmount:
          source.expectedAmount != null ? String(source.expectedAmount) : "",
        kind: source.kind,
        recurrence: source.recurrence ?? "monthly",
        isPrimary: Boolean(source.isPrimary),
      }));
    }
    if (hasLegacyIncomeSetup(moneySetup)) {
      return [
        {
          id: "legacy-income",
          label: locale === "ru" ? "Основной доход" : "Primary income",
          expectedDate: moneySetup.nextIncomeDate ?? "",
          expectedAmount:
            moneySetup.expectedIncomeAmount != null
              ? String(moneySetup.expectedIncomeAmount)
              : "",
          kind: "salary" as MoneySetupIncomeSourceKind,
          recurrence: "monthly" as MoneySetupIncomeRecurrence,
          isPrimary: true,
        },
      ];
    }
    return [];
  }, [incomeSources, locale, moneySetup, showIncomeSources]);

  useEffect(() => {
    if (!open || !normalizedInitialSection) return;

    const target =
      normalizedInitialSection === "balance"
        ? balanceSectionRef.current
        : normalizedInitialSection === "income"
        ? incomeSectionRef.current
        : essentialCategoriesSectionRef.current;

    const frame = window.requestAnimationFrame(() => {
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
      if (normalizedInitialSection === "balance") {
        currentBalanceInputRef.current?.focus();
      }
      if (normalizedInitialSection === "income") {
        incomeDateInputRef.current?.focus();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [normalizedInitialSection, open]);

  const addIncomeSource = () => {
    setShowIncomeSources(true);
    setIncomeSources((prev) =>
      startIncomeSourcesEditing({
        moneySetup,
        currentDrafts: prev,
        locale,
        appendBlank: true,
      }),
    );
  };

  const updateIncomeSource = (
    id: string,
    patch: Partial<IncomeSourceDraft>,
  ) => {
    setIncomeSources((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const setPrimaryIncomeSource = (id: string) => {
    setIncomeSources((prev) =>
      prev.map((item) => ({ ...item, isPrimary: item.id === id })),
    );
  };

  const removeIncomeSource = (id: string) => {
    setIncomeSources((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (next.length === 0) return next;
      if (next.some((item) => item.isPrimary)) return next;
      return next.map((item, index) => ({ ...item, isPrimary: index === 0 }));
    });
  };

  const requestSingleIncomeMode = () => {
    if (incomeSources.length === 0) {
      setShowIncomeSources(false);
      setConfirmResetIncomeSources(false);
      return;
    }
    setConfirmResetIncomeSources(true);
  };

  const confirmSingleIncomeMode = () => {
    const primary = getPrimaryIncomeSourceDraft(incomeSources);
    if (primary) {
      setNextIncomeDate(primary.expectedDate);
      setExpectedIncomeAmount(primary.expectedAmount);
    }
    setIncomeSources([]);
    setShowIncomeSources(false);
    setConfirmResetIncomeSources(false);
  };

  const handleSave = () => {
    const parsedCurrentBalance = parseBalanceAmount(currentBalanceInput);
    if (parsedCurrentBalance != null) {
      setActualCash("me", parsedCurrentBalance);
    }

    const incomePayload = buildIncomeSetupSavePayload({
      showIncomeSources,
      incomeSources,
      nextIncomeDate,
      expectedIncomeAmount,
    });

    updateMoneySetup({
      ...incomePayload,
      requiredRecurringIds: moneySetup.requiredRecurringIds,
      hasNoRequiredFixedExpenses: moneySetup.hasNoRequiredFixedExpenses,
      essentialCategoryIds,
      useHouseholdBalance: showHouseholdToggle ? useHouseholdBalance : false,
    });
    toast(
      locale === "ru" ? "Финансовая база сохранена" : "Financial base saved",
      "success",
    );
    onOpenChange(false);
  };

  const handleSaveCurrentBalanceOnly = () => {
    const parsedCurrentBalance = parseBalanceAmount(currentBalanceInput);
    if (parsedCurrentBalance == null) {
      toast(
        locale === "ru"
          ? "Введите текущий доступный остаток"
          : "Enter the current available balance",
        "error",
      );
      return;
    }
    setActualCash("me", parsedCurrentBalance);
    toast(
      locale === "ru" ? "Текущий остаток сохранён" : "Current balance saved",
      "success",
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,var(--tg-viewport-height,90vh))] max-w-sm flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-10 text-left">
          <DialogTitle className="text-base">
            {locale === "ru" ? "Финансовая база" : "Money setup"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {locale === "ru"
              ? "Коротко укажите доход и обязательные расходы."
              : "Quickly add your income and must-cover expenses."}
          </p>
          <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {progress.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {progress.summary}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {progress.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-muted-foreground">{item.label}</span>
                  <span
                    className={
                      item.done ? "font-medium text-foreground" : "text-muted-foreground"
                    }
                  >
                    {item.done
                      ? locale === "ru"
                        ? "Готово"
                        : "Done"
                      : locale === "ru"
                        ? "Нужно заполнить"
                        : "Needs input"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <div ref={balanceSectionRef} className="space-y-3">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {balanceSectionView.title}
                </p>
                {balanceSectionView.completionLabel ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    {balanceSectionView.completionLabel}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {balanceSectionView.prompt}
              </p>
            </div>

            <div className="rounded-md border border-border/70 bg-background px-3 py-3">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  {balanceSectionView.inputLabel}
                </label>
                <Input
                  ref={currentBalanceInputRef}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder={locale === "ru" ? "Например, 45000" : "For example, 45000"}
                  value={currentBalanceInput}
                  onChange={(event) => setCurrentBalanceInput(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {balanceSectionView.currentAmountNote}
                </p>
              </div>

              {balanceSectionView.showInlineSaveButton ? (
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={handleSaveCurrentBalanceOnly}
                >
                  {locale === "ru" ? "Сохранить" : "Save"}
                </Button>
              ) : null}
            </div>
          </div>

          <div ref={incomeSectionRef} className="space-y-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {locale === "ru" ? "Доходы" : "Income"}
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === "ru"
                  ? "Регулярный или плановый доход добавляйте здесь. Разовое поступление остаётся через «Добавить операцию»."
                  : "Add regular or planned income here. One-off money still goes through Add entry."}
              </p>
            </div>

            {!showIncomeSources ? (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    {locale === "ru" ? "Следующий доход" : "Next income"}
                  </label>
                  <Input
                    ref={incomeDateInputRef}
                    type="date"
                    value={nextIncomeDate}
                    onChange={(event) => setNextIncomeDate(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">
                    {locale === "ru"
                      ? "Примерная сумма дохода"
                      : "Estimated income amount"}
                  </label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder={
                      locale === "ru" ? "Например, 120000" : "For example, 120000"
                    }
                    value={expectedIncomeAmount}
                    onChange={(event) =>
                      setExpectedIncomeAmount(event.target.value)
                    }
                  />
                </div>
              </>
            ) : null}

            {visibleIncomeSources.length > 0 ? (
              <div className="space-y-2">
                {visibleIncomeSources.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-md border border-border/70 bg-background px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.label || (locale === "ru" ? "Источник дохода" : "Income source")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.expectedAmount
                            ? `${item.expectedAmount} ${locale === "ru" ? "₽" : "RUB"}`
                            : locale === "ru"
                              ? "Сумма не указана"
                              : "Amount missing"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.expectedDate
                            ? item.expectedDate
                            : locale === "ru"
                              ? "Дата не указана"
                              : "Date missing"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.recurrence === "monthly"
                            ? locale === "ru"
                              ? "Повторяется каждый месяц"
                              : "Repeats every month"
                            : locale === "ru"
                              ? "Разовое поступление"
                              : "One-time income"}
                        </p>
                      </div>
                      {!showIncomeSources ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setShowIncomeSources(true);
                            setIncomeSources(
                              startIncomeSourcesEditing({
                                moneySetup,
                                currentDrafts: incomeSources,
                                locale,
                                appendBlank: false,
                              }),
                            );
                          }}
                        >
                          {locale === "ru" ? "Изменить доход" : "Edit income"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <Button
              type="button"
              variant={showIncomeSources ? "outline" : "secondary"}
              className="h-9 w-full justify-center text-sm font-medium"
              onClick={addIncomeSource}
            >
              {locale === "ru"
                ? "Добавить источник дохода"
                : "Add income source"}
            </Button>

            {showIncomeSources ? (
              <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {locale === "ru" ? "Источники дохода" : "Income sources"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {locale === "ru"
                      ? "Доход приходит несколькими частями. Добавьте ожидаемые поступления отдельно: аванс, зарплата, аренда, подработка."
                      : "Income arrives in several parts. Add expected payouts separately: advance, salary, rent, freelance."}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto justify-start px-0 text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={requestSingleIncomeMode}
                >
                  {locale === "ru"
                    ? "Вернуться к одному доходу"
                    : "Back to single income"}
                </Button>

                {confirmResetIncomeSources ? (
                  <div className="space-y-2 rounded-md border border-border/70 bg-background px-3 py-3">
                    <p className="text-sm font-medium text-foreground">
                      {locale === "ru"
                        ? "Вернуться к одному доходу?"
                        : "Return to single income?"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {locale === "ru"
                        ? "Сохранённые выплаты будут убраны из расчёта. Вы сможете добавить их заново позже."
                        : "Saved payouts will be removed from the calculation. You can add them again later."}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setConfirmResetIncomeSources(false)}
                      >
                        {locale === "ru" ? "Отмена" : "Cancel"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1"
                        onClick={confirmSingleIncomeMode}
                      >
                        {locale === "ru"
                          ? "Вернуться к одному доходу"
                          : "Back to single income"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {incomeSources.length > 0 ? (
                  <div className="space-y-3">
                    {incomeSources.map((item, index) => (
                      <div
                        key={item.id}
                        className="space-y-2 rounded-md border border-border/70 bg-background px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input
                              type="radio"
                              name="money-setup-primary-income"
                              checked={item.isPrimary}
                              onChange={() => setPrimaryIncomeSource(item.id)}
                            />
                            <span>
                              {locale === "ru"
                                ? "Основной источник"
                                : "Primary source"}
                            </span>
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => removeIncomeSource(item.id)}
                          >
                            {locale === "ru" ? "Удалить" : "Remove"}
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          <Input
                            placeholder={
                              locale === "ru"
                                ? index === 0
                                  ? "Например, Аванс"
                                  : "Название источника"
                                : index === 0
                                  ? "For example, Advance"
                                  : "Source name"
                            }
                            value={item.label}
                            onChange={(event) =>
                              updateIncomeSource(item.id, {
                                label: event.target.value,
                              })
                            }
                          />

                          <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">
                              {locale === "ru" ? "Тип" : "Kind"}
                            </span>
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                              value={item.kind}
                              onChange={(event) =>
                                updateIncomeSource(item.id, {
                                  kind: event.target
                                    .value as MoneySetupIncomeSourceKind,
                                })
                              }
                            >
                              {incomeKindOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">
                              {locale === "ru" ? "Повтор" : "Repeat"}
                            </span>
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                              value={item.recurrence}
                              onChange={(event) =>
                                updateIncomeSource(item.id, {
                                  recurrence: event.target
                                    .value as MoneySetupIncomeRecurrence,
                                })
                              }
                            >
                              {incomeRecurrenceOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              type="date"
                              value={item.expectedDate}
                              onChange={(event) =>
                                updateIncomeSource(item.id, {
                                  expectedDate: event.target.value,
                                })
                              }
                            />
                            <Input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              placeholder={locale === "ru" ? "Сумма" : "Amount"}
                              value={item.expectedAmount}
                              onChange={(event) =>
                                updateIncomeSource(item.id, {
                                  expectedAmount: event.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {locale === "ru"
                      ? "Пока добавлен один простой сценарий. При желании можно разбить доход на несколько выплат."
                      : "The simple single-income mode is still active. You can split income into several payouts if needed."}
                  </p>
                )}

              </div>
            ) : null}
          </div>

          <div ref={essentialCategoriesSectionRef} className="space-y-2.5">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {locale === "ru"
                  ? "Необходимые категории для жизни"
                  : "Essential life categories"}
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === "ru"
                  ? "Отметьте то, без чего нельзя прожить до следующего дохода."
                  : "Mark what you need before the next income arrives."}
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === "ru"
                  ? "Обязательные платежи — это конкретные платежи с датой и суммой. Необходимые категории — это базовые траты: продукты, транспорт, здоровье."
                  : "Required payments are specific payments with a date and amount. Essential categories are core expenses like groceries, transport, and health."}
              </p>
            </div>

            <div className="space-y-2">
              {categoryOptions.map((category) => (
                <label
                  key={category.id}
                  className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={essentialCategoryIds.includes(category.id)}
                    onChange={() =>
                      setEssentialCategoryIds((prev) =>
                        toggleId(prev, category.id),
                      )
                    }
                  />
                  <span className="text-foreground">
                    {getCategoryLabel(category.id, categories, locale)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {showHouseholdToggle ? (
            <label className="flex items-start gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={useHouseholdBalance}
                onChange={(event) =>
                  setUseHouseholdBalance(event.target.checked)
                }
              />
              <span>
                <span className="block font-medium text-foreground">
                  {locale === "ru"
                    ? "Считать по семейному балансу"
                    : "Use family balance"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {locale === "ru"
                    ? "Если расходы и доходы общие, можно учитывать общий остаток."
                    : "Use the shared balance if income and expenses are common."}
                </span>
              </span>
            </label>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2 border-t px-4 py-3">
          <Button type="button" className="flex-1" onClick={handleSave}>
            {locale === "ru" ? "Сохранить" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            {locale === "ru" ? "Позже" : "Later"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
