"use client";

import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Landmark,
  Pencil,
  PiggyBank,
  Shield,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  HomeSectionCardHeader,
  HomeSectionCollapsedBar,
  homeSectionContentClassName,
  sectionToggleButtonClassName,
} from "@/components/HomeSectionCardHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancialChart } from "@/components/FinancialChart";
import { AiAnalysisTab } from "@/components/AiAnalysisTab";
import {
  getCategoriesByType,
  getCategoryLabel,
  getFallbackCategoryId,
  sortCategoriesByLabel,
} from "@/lib/categories";
import { formatBudgetPeriodLabel, getCurrentBudgetPeriod, isDateInBudgetPeriod } from "@/lib/budget-period";
import { formatMoney } from "@/lib/format-money";
import {
  formatMonthYearLong,
  formatPlanningDeadline,
  formatTransactionDate,
  normalizeIsoDate,
} from "@/lib/format-date";
import {
  advanceRecurringDate,
  avgMonthlyExpenses,
  budgetUsagePercent,
  emergencyTargetAmount,
  goalProgressPercent,
  monthSpentByCategory,
  resolveGoalMonthlyPlans,
  resolveGoalTarget,
  todayIso,
} from "@/lib/planning/analytics";
import type { GoalMonthlyPlans } from "@/lib/planning/analytics";
import {
  effectiveSkippedDates,
  recurringDisplayName,
} from "@/lib/planning/recurring-skipped";
import {
  resolveFutureOneTimeTransactionGroup,
  resolveFutureRecurringOperationGroup,
  splitPlannedFutureOperationsByMonth,
  type FutureOperationGroup,
} from "@/lib/planning/future-operation-groups";
import { resolveRecurringOccurrenceDate } from "@/lib/recurring-occurrence";
import { resolveRecurringOccurrenceStatus } from "@/lib/recurring-occurrence-status";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useCategories, useStore, useTransactions } from "@/store/useStore";
import type { Locale, Transaction, TxType } from "@/types";
import { EMERGENCY_GOAL_ID } from "@/types/planning";
import type { DebtItem, RecurringFrequency, SavingsGoal } from "@/types/planning";

const HOUSEHOLD_DEBT_STRATEGY_KEY = "voicebudget-household-debt-strategy";

export type PlanningTab =
  | "goals"
  | "funds"
  | "limits"
  | "debts"
  | "emergency"
  | "recurring"
  | "stats"
  | "advisor";

const DEFAULT_VISIBLE_TABS: PlanningTab[] = [
  "goals",
  "funds",
  "limits",
  "debts",
  "emergency",
  "recurring",
  "stats",
  "advisor",
];

function replaceTokens(template: string, tokens: Record<string, string>): string {
  let s = template;
  for (const [key, value] of Object.entries(tokens)) {
    s = s.split(`{${key}}`).join(value);
  }
  return s;
}

function GoalMonthlyPlansBlock({
  plans,
  deadline,
  locale,
}: {
  plans: GoalMonthlyPlans;
  deadline: string | null;
  locale: Locale;
}) {
  return (
    <div className="mt-0.5 space-y-0.5">
      {deadline ? (
        <p className="text-xs text-muted-foreground">
          {replaceTokens(t(locale, "planningGoalUntil"), {
            date: formatPlanningDeadline(deadline, locale),
          })}
          {" · "}
          {replaceTokens(t(locale, "planningGoalMonthsLeft"), {
            months: String(plans.months),
          })}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {replaceTokens(t(locale, "planningGoalMonthlyOnAccount"), {
          amount: formatMoney(plans.onAccount, locale),
        })}
      </p>
      <p className="text-xs font-medium text-primary">
        {replaceTokens(t(locale, "planningGoalMonthlyIfInvested"), {
          amount: formatMoney(plans.ifInvested, locale),
        })}
      </p>
    </div>
  );
}

function ProgressBar({ percent, over }: { percent: number; over?: boolean }) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full transition-all ${over ? "bg-destructive" : "bg-primary"}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function numInput(value: string): number {
  return Number(value.replace(/\s/g, "").replace(",", ".")) || 0;
}

function recurringEndDateFromMonths(
  startDate: string,
  intervalMonths: number,
  durationMonths: number,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  const total = Math.max(1, Math.min(120, Math.round(durationMonths)));
  let runDate = startDate;
  const dayOfMonth = new Date(`${startDate}T12:00:00`).getDate();
  for (let index = 1; index < total; index += 1) {
    runDate = advanceRecurringDate(runDate, "monthly", dayOfMonth, intervalMonths);
  }
  return runDate;
}

function debtOwnerLabel(owner: DebtItem["owner"], locale: Locale): string {
  if (owner === "me") return locale === "ru" ? "Я" : "Me";
  if (owner === "partner") return locale === "ru" ? "Партнёр" : "Partner";
  return locale === "ru" ? "Общий" : "Shared";
}

function debtStrategyLabel(strategy: DebtItem["strategy"], locale: Locale): string {
  if (strategy === "snowball") return locale === "ru" ? "Снежный ком" : "Snowball";
  return locale === "ru" ? "Лавина" : "Avalanche";
}

function debtStrategyHelp(strategy: DebtItem["strategy"], locale: Locale): string {
  if (strategy === "snowball") {
    return locale === "ru"
      ? "Снежный ком: сначала закрываем самый маленький долг. Это быстрее даёт ощущение победы и помогает не бросить план."
      : "Snowball: pay off the smallest debt first. It creates quick wins and helps you stay consistent.";
  }
  return locale === "ru"
    ? "Лавина: сначала гасим долг с самой высокой ставкой. Обычно это математически выгоднее, потому что меньше переплата."
    : "Avalanche: pay the highest-rate debt first. It is usually mathematically better because it reduces overpayment.";
}

function sortDebtsByStrategy(debts: DebtItem[], strategy: DebtItem["strategy"]): DebtItem[] {
  const today = todayIso();
  return [...debts].sort((a, b) => {
    const aOverdue = a.nextPaymentDate ? a.nextPaymentDate < today : false;
    const bOverdue = b.nextPaymentDate ? b.nextPaymentDate < today : false;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (strategy === "snowball") {
      if (a.balance !== b.balance) return a.balance - b.balance;
      return (b.ratePct ?? 0) - (a.ratePct ?? 0);
    }
    const ar = a.ratePct ?? -1;
    const br = b.ratePct ?? -1;
    if (br !== ar) return br - ar;
    return a.balance - b.balance;
  });
}

function goalDeadlineTime(deadline: string | null): number | null {
  if (!deadline) return null;
  const time = new Date(`${deadline}T12:00:00`).getTime();
  return Number.isNaN(time) ? null : time;
}

function sortGoalsByPriority(goals: SavingsGoal[], transactions: Transaction[]): SavingsGoal[] {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const today = now.getTime();

  return [...goals].sort((a, b) => {
    const aTarget = resolveGoalTarget(a, transactions);
    const bTarget = resolveGoalTarget(b, transactions);
    const aDone = aTarget > 0 && a.savedAmount >= aTarget;
    const bDone = bTarget > 0 && b.savedAmount >= bTarget;
    if (aDone !== bDone) return aDone ? 1 : -1;

    const aStarted = a.savedAmount > 0;
    const bStarted = b.savedAmount > 0;
    if (aStarted !== bStarted) return aStarted ? -1 : 1;

    const aDeadline = goalDeadlineTime(a.deadline);
    const bDeadline = goalDeadlineTime(b.deadline);
    const aRemaining = Math.max(0, aTarget - a.savedAmount);
    const bRemaining = Math.max(0, bTarget - b.savedAmount);
    if (aDeadline !== null && bDeadline !== null) {
      const aDays = Math.floor((aDeadline - today) / (24 * 60 * 60 * 1000));
      const bDays = Math.floor((bDeadline - today) / (24 * 60 * 60 * 1000));
      if (aDays !== bDays) return aDays - bDays;
      if (aRemaining !== bRemaining) return aRemaining - bRemaining;
    }
    if (aDeadline !== null) return -1;
    if (bDeadline !== null) return 1;
    if (aRemaining !== bRemaining) return aRemaining - bRemaining;

    const aMonthly = a.monthlyContribution ?? 0;
    const bMonthly = b.monthlyContribution ?? 0;
    if (aMonthly !== bMonthly) return bMonthly - aMonthly;

    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function PlanningPanel({
  collapsible = true,
  activeTab,
  onActiveTabChange,
  visibleTabs = DEFAULT_VISIBLE_TABS,
  focusEntityId = null,
}: {
  collapsible?: boolean;
  activeTab?: PlanningTab;
  onActiveTabChange?: (tab: PlanningTab) => void;
  visibleTabs?: PlanningTab[];
  focusEntityId?: string | null;
} = {}) {
  const locale = useStore((s) => s.locale);
  const transactions = useTransactions();
  const categories = useCategories();
  const savingsGoals = useStore((s) => s.savingsGoals);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const debts = useStore((s) => s.debts);
  const addGoal = useStore((s) => s.addGoal);
  const updateGoal = useStore((s) => s.updateGoal);
  const depositGoal = useStore((s) => s.depositGoal);
  const withdrawGoal = useStore((s) => s.withdrawGoal);
  const revertLastGoalDeposit = useStore((s) => s.revertLastGoalDeposit);
  const removeGoal = useStore((s) => s.removeGoal);
  const enableEmergencyFund = useStore((s) => s.enableEmergencyFund);
  const setCategoryBudget = useStore((s) => s.setCategoryBudget);
  const removeCategoryBudget = useStore((s) => s.removeCategoryBudget);
  const addRecurring = useStore((s) => s.addRecurring);
  const addTransaction = useStore((s) => s.addTransaction);
  const updateRecurring = useStore((s) => s.updateRecurring);
  const removeRecurring = useStore((s) => s.removeRecurring);
  const deleteTransaction = useStore((s) => s.deleteTransaction);
  const addDebt = useStore((s) => s.addDebt);
  const updateDebt = useStore((s) => s.updateDebt);
  const payDebt = useStore((s) => s.payDebt);
  const removeDebt = useStore((s) => s.removeDebt);
  const entryOwner = useStore((s) => s.entryOwner);
  const budgetMonthStartDay = useStore((s) => s.budgetMonthStartDay);
  const setBudgetMonthStartDay = useStore((s) => s.setBudgetMonthStartDay);
  const collapsed = useStore((s) => s.planningPanelCollapsed);
  const setPlanningPanelCollapsed = useStore((s) => s.setPlanningPanelCollapsed);

  const [hydrated, setHydrated] = useState(false);
  const [expandedFutureMonths, setExpandedFutureMonths] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const finish = () => setHydrated(true);
    if (useStore.persist.hasHydrated()) {
      finish();
      return;
    }
    return useStore.persist.onFinishHydration(finish);
  }, []);

  const open = !collapsible || (hydrated && !collapsed);
  const planningTabClass =
    "h-auto min-h-9 w-full min-w-0 rounded-md px-2 text-center text-xs font-semibold leading-tight whitespace-normal text-foreground/70 transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm";

  const toggleOpen = useCallback(() => {
    setPlanningPanelCollapsed(!useStore.getState().planningPanelCollapsed);
  }, [setPlanningPanelCollapsed]);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");
  const [depositGoalId, setDepositGoalId] = useState<string | null>(null);
  const [depositGoalMode, setDepositGoalMode] = useState<"deposit" | "withdraw">("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [editGoalId, setEditGoalId] = useState<string | null>(null);
  const [editGoalName, setEditGoalName] = useState("");
  const [editGoalTarget, setEditGoalTarget] = useState("");
  const [editGoalDeadline, setEditGoalDeadline] = useState("");
  const [fundName, setFundName] = useState("");
  const [editFundId, setEditFundId] = useState<string | null>(null);
  const [editFundName, setEditFundName] = useState("");
  const [fundInfoOpen, setFundInfoOpen] = useState(false);
  const [limitCategoryId, setLimitCategoryId] = useState("");
  const [limitAmount, setLimitAmount] = useState("");
  const [recType, setRecType] = useState<TxType>("expense");
  const [recCategoryId, setRecCategoryId] = useState(() => getFallbackCategoryId("expense"));
  const [recAmount, setRecAmount] = useState("");
  const [recNote, setRecNote] = useState("");
  const [recComment, setRecComment] = useState("");
  const [recRepeat, setRecRepeat] = useState<"once" | RecurringFrequency>("monthly");
  const [recStartDate, setRecStartDate] = useState(() => todayIso());
  const recStartDateInputRef = useRef<HTMLInputElement | null>(null);
  const [recEndMode, setRecEndMode] = useState<"never" | "date" | "months">("never");
  const [recEndDate, setRecEndDate] = useState("");
  const [recDurationMonths, setRecDurationMonths] = useState("12");
  const [debtName, setDebtName] = useState("");
  const [debtBalance, setDebtBalance] = useState("");
  const [debtMinPayment, setDebtMinPayment] = useState("");
  const [debtRate, setDebtRate] = useState("");
  const [debtDate, setDebtDate] = useState("");
  const [debtOwner, setDebtOwner] = useState<DebtItem["owner"]>("all");
  const [debtStrategy, setDebtStrategy] = useState<DebtItem["strategy"]>("avalanche");
  const [debtPayId, setDebtPayId] = useState<string | null>(null);
  const [debtPayAmount, setDebtPayAmount] = useState("");
  const [editDebtId, setEditDebtId] = useState<string | null>(null);
  const [editDebtName, setEditDebtName] = useState("");
  const [editDebtBalance, setEditDebtBalance] = useState("");
  const [editDebtMinPayment, setEditDebtMinPayment] = useState("");
  const [editDebtRate, setEditDebtRate] = useState("");
  const [editDebtDate, setEditDebtDate] = useState("");
  const [editDebtOwner, setEditDebtOwner] = useState<DebtItem["owner"]>("all");
  const [emergencyInfoOpen, setEmergencyInfoOpen] = useState(false);
  const [planningTab, setPlanningTab] = useState<PlanningTab>(
    activeTab && visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0] ?? "goals",
  );
  const currentPlanningTab =
    activeTab && visibleTabs.includes(activeTab) ? activeTab : planningTab;

  useEffect(() => {
    if (activeTab && visibleTabs.includes(activeTab)) return;
    if (visibleTabs.includes(planningTab)) return;
    setPlanningTab(visibleTabs[0] ?? "goals");
  }, [activeTab, planningTab, visibleTabs]);

  useEffect(() => {
    if (!focusEntityId) return;
    const element = document.querySelector<HTMLElement>(
      `[data-plan-entity-id="${focusEntityId}"]`,
    );
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusEntityId, currentPlanningTab]);

  const changePlanningTab = useCallback(
    (value: string) => {
      const next = value as PlanningTab;
      if (!visibleTabs.includes(next)) return;
      if (!activeTab) {
        setPlanningTab(next);
      }
      onActiveTabChange?.(next);
    },
    [activeTab, onActiveTabChange, visibleTabs],
  );

  const customGoals = useMemo(
    () =>
      sortGoalsByPriority(
        savingsGoals.filter((g) => g.kind !== "emergency" && g.targetAmount > 0),
        transactions,
      ),
    [savingsGoals, transactions],
  );
  const funds = useMemo(
    () =>
      [...savingsGoals]
        .filter((g) => g.kind !== "emergency" && g.targetAmount <= 0)
        .sort(
          (a, b) =>
            b.savedAmount - a.savedAmount ||
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
    [savingsGoals],
  );
  const emergencyGoal = savingsGoals.find((g) => g.id === EMERGENCY_GOAL_ID || g.kind === "emergency");
  const expenseCategories = useMemo(
    () => sortCategoriesByLabel(categories.filter((c) => c.type === "expense"), categories, locale),
    [categories, locale],
  );
  const sortedCategoryBudgets = useMemo(
    () =>
      [...categoryBudgets].sort((a, b) =>
        getCategoryLabel(a.categoryId, categories, locale).localeCompare(
          getCategoryLabel(b.categoryId, categories, locale),
          locale === "ru" ? "ru" : "en",
          { sensitivity: "base" },
        ),
      ),
    [categoryBudgets, categories, locale],
  );
  const avgMonthly = useMemo(() => avgMonthlyExpenses(transactions), [transactions]);
  const budgetPeriodLabel = useMemo(
    () => formatBudgetPeriodLabel(getCurrentBudgetPeriod(budgetMonthStartDay), locale),
    [budgetMonthStartDay, locale],
  );
  const debtTotals = useMemo(
    () => ({
      balance: debts.reduce((sum, d) => sum + d.balance, 0),
      minPayment: debts.reduce((sum, d) => sum + d.minPayment, 0),
    }),
    [debts],
  );
  const sortedDebts = useMemo(
    () => sortDebtsByStrategy(debts, debtStrategy),
    [debts, debtStrategy],
  );
  const debtFocus = useMemo(() => {
    const active = sortedDebts.filter((d) => d.balance > 0);
    if (active.length === 0) return null;
    return active[0];
  }, [sortedDebts]);

  useEffect(() => {
    const stored = localStorage.getItem(HOUSEHOLD_DEBT_STRATEGY_KEY);
    if (stored === "snowball" || stored === "avalanche") {
      setDebtStrategy(stored);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(HOUSEHOLD_DEBT_STRATEGY_KEY, debtStrategy);
  }, [debtStrategy]);

  const editingGoal = editGoalId
    ? customGoals.find((g) => g.id === editGoalId) ?? null
    : null;

  const createMonthlyPreview = useMemo(() => {
    const target = goalTarget ? Number(goalTarget.replace(/\s/g, "")) : 0;
    const deadline = goalDeadline.trim() || null;
    return resolveGoalMonthlyPlans(target, 0, deadline);
  }, [goalTarget, goalDeadline]);

  const editMonthlyPreview = useMemo(() => {
    if (!editingGoal) return null;
    const target = editGoalTarget ? Number(editGoalTarget.replace(/\s/g, "")) : 0;
    const deadline = editGoalDeadline.trim() || null;
    return resolveGoalMonthlyPlans(target, editingGoal.savedAmount, deadline);
  }, [editingGoal, editGoalTarget, editGoalDeadline]);

  const handleAddGoal = () => {
    const name = goalName.trim();
    if (!name) return;
    const target = goalTarget ? Number(goalTarget.replace(/\s/g, "")) : 0;
    addGoal(name, target > 0 ? target : 0, goalDeadline.trim() || null);
    setGoalName("");
    setGoalTarget("");
    setGoalDeadline("");
  };

  const handleAddFund = () => {
    const name = fundName.trim();
    if (!name) return;
    addGoal(name, 0, null);
    setFundName("");
  };

  const handleGoalTransfer = (id: string) => {
    const raw = depositAmount.replace(/\s/g, "");
    const amount = Number(raw);
    if (!raw.trim()) return;
    if (!amount && depositGoalMode === "deposit") {
      revertLastGoalDeposit(id);
      setDepositAmount("");
      setDepositGoalId(null);
      return;
    }
    if (depositGoalMode === "withdraw") {
      withdrawGoal(id, amount);
    } else {
      depositGoal(id, amount);
    }
    setDepositAmount("");
    setDepositGoalId(null);
  };

  const handleSaveGoalEdit = (id: string) => {
    const target = editGoalTarget ? Number(editGoalTarget.replace(/\s/g, "")) : 0;
    updateGoal(id, {
      name: editGoalName.trim(),
      targetAmount: target > 0 ? target : 0,
      deadline: editGoalDeadline.trim() || null,
    });
    setEditGoalId(null);
    setEditGoalName("");
    setEditGoalTarget("");
    setEditGoalDeadline("");
  };

  const startEditGoal = (goal: SavingsGoal, displayTarget: number) => {
    setEditGoalId(goal.id);
    setEditGoalName(goal.name);
    setEditGoalTarget(displayTarget > 0 ? String(displayTarget) : "");
    setEditGoalDeadline(goal.deadline ?? "");
    setDepositGoalId(null);
  };

  const startEditFund = (fund: SavingsGoal) => {
    setEditFundId(fund.id);
    setEditFundName(fund.name);
    setDepositGoalId(null);
  };

  const handleSaveFundEdit = (id: string) => {
    const name = editFundName.trim();
    if (!name) return;
    updateGoal(id, { name });
    setEditFundId(null);
    setEditFundName("");
  };

  const handleSetLimit = () => {
    const amount = Number(limitAmount.replace(/\s/g, ""));
    if (!limitCategoryId || !amount) return;
    setCategoryBudget(limitCategoryId, amount);
    setLimitAmount("");
  };

  const handleRecStartDateInput = useCallback((value: string) => {
    const normalized = normalizeIsoDate(value);
    if (normalized) {
      setRecStartDate(normalized);
    }
  }, []);

  const handleAddRecurring = () => {
    const amount = Number(recAmount.replace(/\s/g, ""));
    const title = recNote.trim();
    const effectiveRecStartDate =
      normalizeIsoDate(recStartDateInputRef.current?.value) ??
      normalizeIsoDate(recStartDate) ??
      todayIso();
    if (!amount || !title) return;
    const categoryId = recCategoryId || getFallbackCategoryId(recType);
    const note = [title, recComment.trim()].filter(Boolean).join(" · ").slice(0, 120);
    if (recRepeat === "once") {
      addTransaction({
        amount,
        type: recType,
        categoryId,
        currency: "RUB",
        note,
        date: effectiveRecStartDate,
        owner: entryOwner,
        confirmed: false,
      });
      setRecStartDate(effectiveRecStartDate);
      setRecAmount("");
      setRecNote("");
      setRecComment("");
      setRecEndMode("never");
      setRecEndDate("");
      setRecDurationMonths("12");
      return;
    }
    const start = new Date(`${effectiveRecStartDate}T12:00:00`);
    const dayOfMonth = recRepeat === "monthly" ? start.getDate() : null;
    const intervalMonths = recRepeat === "monthly" ? 1 : null;
    const endDate =
      recEndMode === "date"
        ? recEndDate || null
        : recEndMode === "months" && recRepeat === "monthly"
          ? recurringEndDateFromMonths(
              effectiveRecStartDate,
              intervalMonths ?? 1,
              Number(recDurationMonths) || 1,
            )
          : null;
    addRecurring({
      amount,
      type: recType,
      categoryId,
      note,
      owner: entryOwner,
      frequency: recRepeat,
      intervalMonths,
      dayOfMonth,
      nextRunDate: effectiveRecStartDate,
      endDate,
    });
    setRecStartDate(effectiveRecStartDate);
    setRecAmount("");
    setRecNote("");
    setRecComment("");
    setRecEndMode("never");
    setRecEndDate("");
    setRecDurationMonths("12");
  };

  const handleAddDebt = () => {
    const name = debtName.trim();
    const balance = numInput(debtBalance);
    if (!name || balance <= 0) return;
    addDebt({
      name,
      owner: debtOwner,
      balance,
      minPayment: Math.max(0, numInput(debtMinPayment)),
      ratePct: debtRate.trim() ? numInput(debtRate) : null,
      nextPaymentDate: debtDate.trim() || null,
      strategy: debtStrategy,
      priority: "normal",
    });
    setDebtName("");
    setDebtBalance("");
    setDebtMinPayment("");
    setDebtRate("");
    setDebtDate("");
  };

  const handleDebtPayment = (id: string) => {
    const amount = numInput(debtPayAmount);
    if (amount <= 0) return;
    const paid = payDebt(id, amount);
    if (!paid) return;
    setDebtPayId(null);
    setDebtPayAmount("");
  };

  const startEditDebt = (debt: DebtItem) => {
    setEditDebtId(debt.id);
    setEditDebtName(debt.name);
    setEditDebtBalance(String(debt.balance || ""));
    setEditDebtMinPayment(String(debt.minPayment || ""));
    setEditDebtRate(debt.ratePct == null ? "" : String(debt.ratePct));
    setEditDebtDate(debt.nextPaymentDate ?? "");
    setEditDebtOwner(debt.owner);
    setDebtPayId(null);
  };

  const cancelEditDebt = () => {
    setEditDebtId(null);
    setEditDebtName("");
    setEditDebtBalance("");
    setEditDebtMinPayment("");
    setEditDebtRate("");
    setEditDebtDate("");
    setEditDebtOwner("all");
  };

  const saveEditDebt = (debt: DebtItem) => {
    const name = editDebtName.trim();
    const balance = numInput(editDebtBalance);
    if (!name || balance < 0) return;
    updateDebt(debt.id, {
      name,
      owner: editDebtOwner,
      balance,
      minPayment: Math.max(0, numInput(editDebtMinPayment)),
      ratePct: editDebtRate.trim() ? numInput(editDebtRate) : null,
      nextPaymentDate: editDebtDate.trim() || null,
    });
    cancelEditDebt();
  };

  const handleRecurringDateChange = (id: string, date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const d = new Date(`${date}T12:00:00`);
    const item = recurringTransactions.find((r) => r.id === id);
    if (!item) return;
    updateRecurring(id, {
      nextRunDate: date,
      dayOfMonth: item.frequency === "monthly" ? d.getDate() : item.dayOfMonth,
    });
  };

  const handleRecurringEndDateChange = (id: string, date: string) => {
    const item = recurringTransactions.find((r) => r.id === id);
    if (!item) return;
    updateRecurring(id, {
      endDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    });
  };

  const recurringEndPreview = useMemo(() => {
    if (recEndMode !== "months" || recRepeat !== "monthly") return null;
    return recurringEndDateFromMonths(
      recStartDate,
      1,
      Number(recDurationMonths) || 1,
    );
  }, [recDurationMonths, recEndMode, recRepeat, recStartDate]);

  const recurringFormCategories = useMemo(
    () => getCategoriesByType(categories, recType, locale),
    [categories, locale, recType],
  );

  useEffect(() => {
    if (recurringFormCategories.some((category) => category.id === recCategoryId)) return;
    setRecCategoryId(getFallbackCategoryId(recType));
  }, [recCategoryId, recType, recurringFormCategories]);

  const recurringPeriod = useMemo(
    () => getCurrentBudgetPeriod(budgetMonthStartDay),
    [budgetMonthStartDay],
  );
  const futureOperationToday = useMemo(() => todayIso(), []);
  const recurringCardsBase = useMemo(() => {
    const today = todayIso();
    return recurringTransactions
      .map((item) => {
        const originalIndex = recurringTransactions.findIndex((entry) => entry.id === item.id);
        const periodTransactions = transactions.filter(
          (tx) =>
            tx.recurringId === item.id &&
            isDateInBudgetPeriod(resolveRecurringOccurrenceDate(tx), recurringPeriod),
        );
        const paidTransactions = periodTransactions.filter((tx) => tx.confirmed !== false);
        const pendingTransactions = periodTransactions.filter((tx) => tx.confirmed === false);
        const skippedInPeriod = (item.skippedDates ?? []).filter((date) =>
          isDateInBudgetPeriod(date, recurringPeriod),
        );
        const pendingDates = pendingTransactions
          .map((tx) => resolveRecurringOccurrenceDate(tx))
          .sort();
        const paidDates = paidTransactions
          .map((tx) => resolveRecurringOccurrenceDate(tx))
          .sort();
        const fallbackOccurrenceDate =
          isDateInBudgetPeriod(item.nextRunDate, recurringPeriod)
            ? item.nextRunDate
            : (skippedInPeriod[0] ?? item.nextRunDate);
        const relevantOccurrenceDate =
          pendingDates[0] ??
          paidDates.at(-1) ??
          skippedInPeriod[0] ??
          fallbackOccurrenceDate;
        const resolvedOccurrence = resolveRecurringOccurrenceStatus({
          item,
          transactions,
          occurrenceDate: relevantOccurrenceDate,
          today,
        });
        const pending =
          resolvedOccurrence.status === "pending" ||
          resolvedOccurrence.status === "rescheduled";
        const paid = resolvedOccurrence.status === "paid";
        const overdue = resolvedOccurrence.status === "overdue";
        const lastPaidDate = paid ? resolvedOccurrence.paidAt : null;
        const status: "paid" | "pending" | "overdue" | "upcoming" | "paused" =
          pending
            ? "pending"
            : paid
              ? "paid"
              : !item.enabled
                ? "paused"
                : overdue
                  ? "overdue"
                  : "upcoming";
        return {
          item,
          paid,
          pending,
          status,
          resolvedStatus: resolvedOccurrence.status,
          lastPaidDate,
          skippedInPeriod,
          scheduledDate: resolvedOccurrence.scheduledDate,
          occurrenceDate: resolvedOccurrence.occurrenceDate,
          relevantOccurrenceDate: resolvedOccurrence.occurrenceDate,
          sortDate: pending
            ? resolvedOccurrence.scheduledDate
            : resolvedOccurrence.occurrenceDate,
          originalIndex,
        };
      });
  }, [recurringPeriod, recurringTransactions, transactions]);

  const futureOperationTransactions = useMemo(() => {
    return transactions
      .filter((transaction) => transaction.recurringId == null)
      .filter((transaction) => transaction.confirmed === false)
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [transactions]);

  const futureOperationSections = useMemo(() => {
    type FutureOperationListItem =
      | {
          kind: "one-time";
          key: string;
          sortDate: string;
          transaction: Transaction;
        }
      | {
          kind: "recurring";
          key: string;
          sortDate: string;
          card: (typeof recurringCardsBase)[number];
        };

    const sections: Record<FutureOperationGroup, FutureOperationListItem[]> = {
      planned: [],
      due: [],
      paid: [],
    };

    for (const transaction of futureOperationTransactions) {
      const group = resolveFutureOneTimeTransactionGroup(transaction, futureOperationToday);
      sections[group].push({
        kind: "one-time",
        key: transaction.id,
        sortDate: transaction.date.slice(0, 10),
        transaction,
      });
    }

    for (const card of recurringCardsBase) {
      const group = resolveFutureRecurringOperationGroup(
        {
          paid: card.paid,
          resolvedStatus: card.resolvedStatus,
          scheduledDate: card.scheduledDate,
        },
        futureOperationToday,
      );
      sections[group].push({
        kind: "recurring",
        key: card.item.id,
        sortDate: group === "paid" ? card.lastPaidDate ?? card.occurrenceDate : card.scheduledDate,
        card,
      });
    }

    sections.planned.sort((left, right) => left.sortDate.localeCompare(right.sortDate));
    sections.due.sort((left, right) => left.sortDate.localeCompare(right.sortDate));
    sections.paid.sort((left, right) => right.sortDate.localeCompare(left.sortDate));

    return sections;
  }, [futureOperationToday, futureOperationTransactions, recurringCardsBase]);

  const plannedFutureOperations = useMemo(
    () => splitPlannedFutureOperationsByMonth(futureOperationSections.planned, futureOperationToday),
    [futureOperationSections.planned, futureOperationToday],
  );

  const futureOperationDisplaySections = useMemo(() => {
    const sections: Array<{
      key: string;
      label: string;
      items: Array<(typeof futureOperationSections.planned)[number]>;
      compactLabel?: string;
    }> = [];

    if (plannedFutureOperations.currentMonth.length > 0) {
      sections.push({
        key: "planned",
        label: t(locale, "planningRecurringSectionPlanned"),
        items: plannedFutureOperations.currentMonth,
      });
    }

    for (const bucket of plannedFutureOperations.laterMonths) {
      sections.push({
        key: `later-${bucket.monthKey}`,
        label: formatMonthYearLong(`${bucket.monthKey}-15`, locale),
        items: bucket.items,
        compactLabel: t(locale, "planningRecurringSectionLater"),
      });
    }

    if (futureOperationSections.due.length > 0) {
      sections.push({
        key: "due",
        label: t(locale, "planningRecurringSectionDue"),
        items: futureOperationSections.due,
      });
    }

    if (futureOperationSections.paid.length > 0) {
      sections.push({
        key: "paid",
        label: t(locale, "planningRecurringSectionPaid"),
        items: futureOperationSections.paid,
      });
    }

    return sections;
  }, [futureOperationSections, locale, plannedFutureOperations]);

  const renderFutureOperationCard = (
    entry:
      | (typeof futureOperationSections.planned)[number]
      | (typeof futureOperationSections.due)[number]
      | (typeof futureOperationSections.paid)[number],
  ) => {
      if (entry.kind === "one-time") {
        const transaction = entry.transaction;
        const categoryLabel = getCategoryLabel(transaction.categoryId, categories, locale);
        const title = transaction.note.trim() || categoryLabel;
        return (
          <div
            key={entry.key}
            className="rounded-lg border border-amber-200/80 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/25"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-1 inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-100">
                  {transaction.type === "income"
                    ? locale === "ru"
                      ? "Разовый доход"
                      : "One-time income"
                    : locale === "ru"
                      ? "Разовый платёж"
                      : "One-time payment"}
                </p>
                <p className="font-medium leading-tight">{title}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {transaction.type === "income" ? "+" : "−"}
                  {formatMoney(transaction.amount, locale)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatTransactionDate(transaction.date, locale)}
                  {" · "}
                  {locale === "ru" ? "Ожидается" : "Expected"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 text-destructive"
                onClick={() => deleteTransaction(transaction.id)}
                aria-label={locale === "ru" ? "Удалить операцию" : "Delete operation"}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      }

      const { item, status, lastPaidDate, skippedInPeriod } = entry.card;
      const categoryLabel = getCategoryLabel(item.categoryId, categories, locale);
      const title = recurringDisplayName(item, categoryLabel);
      const skipped = effectiveSkippedDates(item, transactions);
      const skipTotal = skipped.length * item.amount;
      return (
        <div
          key={entry.key}
          data-plan-entity-id={item.id}
          className={cn(
            "rounded-lg border p-3",
            item.enabled
              ? "border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/25"
              : "border-red-200/80 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/25",
          )}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p
                className={cn(
                  "mb-1 inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                  status === "paid"
                    ? "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-100"
                    : item.enabled
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100"
                      : "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-100",
                )}
              >
                {status === "paid"
                  ? t(locale, "planningRecurringStatusPaid")
                  : status === "pending"
                    ? t(locale, "planningRecurringStatusPending")
                    : item.enabled
                      ? t(locale, "planningRecurringStatusActive")
                      : t(locale, "planningRecurringStatusPaused")}
              </p>
              <p className="font-medium leading-tight">{title}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatMoney(item.amount, locale)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.frequency === "weekly"
                  ? t(locale, "planningRecurringWeekly")
                  : item.frequency === "monthly"
                    ? (item.intervalMonths ?? 1) > 1
                      ? replaceTokens(t(locale, "planningRecurringEveryMonths"), {
                          count: String(item.intervalMonths ?? 1),
                        })
                      : t(locale, "planningRecurringMonthly")
                    : t(locale, "planningRecurringYearly")}
                {" · "}
                {replaceTokens(t(locale, "planningRecurringNext"), {
                  date: formatTransactionDate(item.nextRunDate, locale),
                })}
              </p>
              {item.endDate ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {locale === "ru"
                    ? `Заканчивается ${formatTransactionDate(item.endDate, locale)}`
                    : `Ends on ${formatTransactionDate(item.endDate, locale)}`}
                </p>
              ) : null}
              {lastPaidDate ? (
                <p className="mt-1 text-xs font-medium text-sky-700 dark:text-sky-300">
                  {replaceTokens(t(locale, "planningRecurringPaidOn"), {
                    date: formatTransactionDate(lastPaidDate, locale),
                  })}
                </p>
              ) : null}
              {skippedInPeriod.length > 0 && !lastPaidDate ? (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  {replaceTokens(t(locale, "planningRecurringSkippedInPeriod"), {
                    count: String(skippedInPeriod.length),
                  })}
                </p>
              ) : null}
              <label className="mt-2 flex flex-col items-start gap-1.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                <span className="shrink-0">{t(locale, "planningRecurringDate")}</span>
                <Input
                  type="date"
                  className="h-8 w-full text-xs sm:w-auto sm:max-w-[10.5rem]"
                  value={item.nextRunDate}
                  onChange={(e) => handleRecurringDateChange(item.id, e.target.value)}
                />
              </label>
              <label className="mt-2 flex flex-col items-start gap-1.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                <span className="shrink-0">
                  {locale === "ru" ? "До даты" : "Until"}
                </span>
                <Input
                  type="date"
                  className="h-8 w-full text-xs sm:w-auto sm:max-w-[10.5rem]"
                  value={item.endDate ?? ""}
                  onChange={(e) => handleRecurringEndDateChange(item.id, e.target.value)}
                />
              </label>
            </div>
            {skipped.length > 0 ? (
              <div className="min-w-[8.5rem] rounded-md border border-amber-300/70 bg-amber-50/80 px-2.5 py-2 text-xs dark:border-amber-800/60 dark:bg-amber-950/40">
                <p className="font-semibold text-amber-900 dark:text-amber-100">
                  {t(locale, "planningRecurringSkippedTitle")}
                </p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {skipped.map((d) => (
                    <li key={d} className="tabular-nums">
                      {replaceTokens(t(locale, "planningRecurringSkippedLine"), {
                        date: formatTransactionDate(d, locale),
                      })}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 font-semibold tabular-nums text-foreground">
                  {replaceTokens(t(locale, "planningRecurringSkippedTotal"), {
                    amount: formatMoney(skipTotal, locale),
                    count: String(skipped.length),
                  })}
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-border/50 pt-2">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "min-h-10",
                item.enabled
                  ? "border-emerald-300/80 bg-white/80 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                  : "border-red-300/80 bg-white/80 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/40",
              )}
              onClick={() => updateRecurring(item.id, { enabled: !item.enabled })}
            >
              {item.enabled
                ? locale === "ru"
                  ? "Приостановить"
                  : "Pause"
                : locale === "ru"
                  ? "Возобновить"
                  : "Resume"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-destructive"
              onClick={() => removeRecurring(item.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
  };

  const showToggle = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={sectionToggleButtonClassName}
      onClick={toggleOpen}
    >
      {open && hydrated ? (
        <>
          <ChevronUp className="h-4 w-4" />
          {t(locale, "planningHide")}
        </>
      ) : (
        <>
          <ChevronDown className="h-4 w-4" />
          {t(locale, "planningShow")}
        </>
      )}
    </Button>
  );

  if (collapsible && hydrated && !open) {
    return (
      <div data-onboarding="planning">
        <HomeSectionCollapsedBar
          icon={PiggyBank}
          title={t(locale, "planningTitle")}
          action={showToggle}
        />
      </div>
    );
  }

  return (
    <Card className="border-primary/20" data-onboarding="planning">
      <HomeSectionCardHeader
        icon={PiggyBank}
        title={t(locale, "planningTitle")}
        action={collapsible ? showToggle : null}
      />
      {open ? (
        <CardContent className={homeSectionContentClassName}>
          <Tabs value={currentPlanningTab} onValueChange={changePlanningTab}>
            <TabsList className="mb-3 grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-primary/20 bg-primary/10 p-1 shadow-sm sm:grid-cols-3">
              {visibleTabs.includes("goals") ? (
                <TabsTrigger value="goals" className={planningTabClass}>
                  {t(locale, "planningTabGoals")}
                </TabsTrigger>
              ) : null}
              {visibleTabs.includes("funds") ? (
                <TabsTrigger value="funds" className={planningTabClass}>
                  {t(locale, "planningTabFunds")}
                </TabsTrigger>
              ) : null}
              {visibleTabs.includes("limits") ? (
                <TabsTrigger value="limits" className={planningTabClass}>
                  {t(locale, "planningTabLimits")}
                </TabsTrigger>
              ) : null}
              {visibleTabs.includes("debts") ? (
                <TabsTrigger value="debts" className={planningTabClass}>
                  {locale === "ru" ? "Долги" : "Debts"}
                </TabsTrigger>
              ) : null}
              {visibleTabs.includes("emergency") ? (
                <TabsTrigger value="emergency" className={planningTabClass}>
                  {t(locale, "planningTabEmergency")}
                </TabsTrigger>
              ) : null}
              {visibleTabs.includes("recurring") ? (
                <TabsTrigger value="recurring" className={planningTabClass}>
                  {t(locale, "planningTabRecurring")}
                </TabsTrigger>
              ) : null}
              {visibleTabs.includes("stats") ? (
                <TabsTrigger value="stats" className={planningTabClass}>
                  {locale === "ru" ? "Статистика" : "Stats"}
                </TabsTrigger>
              ) : null}
              {visibleTabs.includes("advisor") ? (
                <TabsTrigger value="advisor" className={planningTabClass}>
                  {locale === "ru" ? "Советник" : "Advisor"}
                </TabsTrigger>
              ) : null}
            </TabsList>

            {visibleTabs.includes("goals") ? (
            <TabsContent value="goals" className="space-y-3">
              {customGoals.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t(locale, "planningGoalEmpty")}</p>
              ) : (
                customGoals.map((goal) => {
                  const target = resolveGoalTarget(goal, transactions);
                  const percent = goalProgressPercent(goal, transactions);
                  const remaining = Math.max(0, target - goal.savedAmount);
                  const monthlyPlans = resolveGoalMonthlyPlans(
                    target,
                    goal.savedAmount,
                    goal.deadline,
                  );
                  return (
                    <div key={goal.id} data-plan-entity-id={goal.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{goal.name}</p>
                          {monthlyPlans ? (
                            <GoalMonthlyPlansBlock
                              plans={monthlyPlans}
                              deadline={goal.deadline}
                              locale={locale}
                            />
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {target > 0
                              ? replaceTokens(t(locale, "planningGoalSaved"), {
                                  saved: formatMoney(goal.savedAmount, locale),
                                  target: formatMoney(target, locale),
                                  percent: String(percent),
                                })
                              : replaceTokens(t(locale, "planningGoalSavedNoTarget"), {
                                  saved: formatMoney(goal.savedAmount, locale),
                                })}
                          </p>
                          {remaining > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {replaceTokens(t(locale, "planningGoalRemaining"), {
                                amount: formatMoney(remaining, locale),
                              })}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => startEditGoal(goal, target)}
                            aria-label={t(locale, "planningGoalEdit")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive"
                            onClick={() => removeGoal(goal.id)}
                            aria-label={t(locale, "planningGoalDelete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <ProgressBar percent={percent} />
                      {editGoalId === goal.id ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            <Input
                              placeholder={t(locale, "planningGoalName")}
                              value={editGoalName}
                              onChange={(e) => setEditGoalName(e.target.value)}
                            />
                            <Input
                              type="number"
                              placeholder={t(locale, "planningGoalTarget")}
                              value={editGoalTarget}
                              onChange={(e) => setEditGoalTarget(e.target.value)}
                            />
                            <Input
                              type="date"
                              aria-label={t(locale, "planningGoalDeadline")}
                              value={editGoalDeadline}
                              onChange={(e) => setEditGoalDeadline(e.target.value)}
                            />
                          </div>
                          {editGoalId === goal.id && editMonthlyPreview ? (
                            <GoalMonthlyPlansBlock
                              plans={editMonthlyPreview}
                              deadline={editGoalDeadline.trim() || null}
                              locale={locale}
                            />
                          ) : null}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSaveGoalEdit(goal.id)}
                            >
                              {t(locale, "planningGoalEditSave")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditGoalId(null)}
                            >
                              {t(locale, "cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {depositGoalId === goal.id ? (
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder={t(locale, "planningGoalDepositAmount")}
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                          />
                          <Button size="sm" onClick={() => handleGoalTransfer(goal.id)}>
                            OK
                          </Button>
                        </div>
                      ) : null}
                      {depositGoalId === goal.id ? (
                        <p className="text-[11px] text-muted-foreground">
                          {t(locale, "planningGoalDepositUndo")}
                        </p>
                      ) : null}
                      {depositGoalId !== goal.id ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDepositGoalMode("deposit");
                              setDepositGoalId(goal.id);
                            }}
                          >
                            {t(locale, "planningGoalDeposit")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={goal.savedAmount <= 0}
                            onClick={() => {
                              setDepositGoalMode("withdraw");
                              setDepositGoalId(goal.id);
                            }}
                          >
                            {t(locale, "planningGoalWithdraw")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
              <div className="flex flex-col gap-2 border-t pt-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Input
                    placeholder={t(locale, "planningGoalName")}
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    className="sm:min-w-[8rem] sm:flex-1"
                  />
                  <Input
                    type="number"
                    placeholder={t(locale, "planningGoalTarget")}
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    className="sm:w-32"
                  />
                  <Input
                    type="date"
                    aria-label={t(locale, "planningGoalDeadline")}
                    value={goalDeadline}
                    onChange={(e) => setGoalDeadline(e.target.value)}
                    className="sm:w-40"
                  />
                </div>
                {createMonthlyPreview ? (
                  <GoalMonthlyPlansBlock
                    plans={createMonthlyPreview}
                    deadline={goalDeadline.trim() || null}
                    locale={locale}
                  />
                ) : null}
                <Button className="sm:self-start" onClick={handleAddGoal}>
                  {t(locale, "planningGoalAdd")}
                </Button>
              </div>
            </TabsContent>
            ) : null}

            {visibleTabs.includes("funds") ? (
            <TabsContent value="funds" className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setFundInfoOpen((open) => !open)}
                  aria-expanded={fundInfoOpen}
                  aria-label={t(locale, "planningFundInfoAria")}
                >
                  <div>
                    <p className="text-sm font-medium">{t(locale, "planningFundTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t(locale, "planningFundHint")}</p>
                  </div>
                  <CircleAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                {fundInfoOpen ? (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {t(locale, "planningFundInfo")}
                  </p>
                ) : null}
              </div>

              {funds.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t(locale, "planningFundEmpty")}</p>
              ) : (
                funds.map((fund) => (
                  <div key={fund.id} data-plan-entity-id={fund.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{fund.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {replaceTokens(t(locale, "planningFundSaved"), {
                            saved: formatMoney(fund.savedAmount, locale),
                          })}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => startEditFund(fund)}
                          aria-label={t(locale, "planningGoalEdit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive"
                          onClick={() => removeGoal(fund.id)}
                          aria-label={t(locale, "planningGoalDelete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {editFundId === fund.id ? (
                      <div className="flex flex-col gap-2">
                        <Input
                          placeholder={t(locale, "planningFundName")}
                          value={editFundName}
                          onChange={(e) => setEditFundName(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSaveFundEdit(fund.id)}>
                            {t(locale, "planningGoalEditSave")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditFundId(null)}
                          >
                            {t(locale, "cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {depositGoalId === fund.id ? (
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder={t(locale, "planningGoalDepositAmount")}
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                        />
                        <Button size="sm" onClick={() => handleGoalTransfer(fund.id)}>
                          OK
                        </Button>
                      </div>
                    ) : null}
                    {depositGoalId !== fund.id ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDepositGoalMode("deposit");
                            setDepositGoalId(fund.id);
                          }}
                        >
                          {t(locale, "planningGoalDeposit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={fund.savedAmount <= 0}
                          onClick={() => {
                            setDepositGoalMode("withdraw");
                            setDepositGoalId(fund.id);
                          }}
                        >
                          {t(locale, "planningGoalWithdraw")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}

              <div className="flex flex-col gap-2 border-t pt-3">
                <Input
                  placeholder={t(locale, "planningFundName")}
                  value={fundName}
                  onChange={(e) => setFundName(e.target.value)}
                  className="sm:max-w-sm"
                />
                <Button className="sm:self-start" onClick={handleAddFund}>
                  {t(locale, "planningFundAdd")}
                </Button>
              </div>
            </TabsContent>
            ) : null}

            {visibleTabs.includes("limits") ? (
            <TabsContent value="limits" className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <p className="text-sm font-medium">{t(locale, "budgetMonthStart")}</p>
                <p className="text-xs text-muted-foreground">{t(locale, "budgetMonthStartHint")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{t(locale, "budgetMonthStartDay")}</span>
                    <select
                      className="flex h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={budgetMonthStartDay}
                      onChange={(e) => setBudgetMonthStartDay(Number(e.target.value))}
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {t(locale, "chartPeriod", { period: budgetPeriodLabel })}
                  </span>
                </div>
              </div>
              {categoryBudgets.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t(locale, "planningLimitEmpty")}</p>
              ) : (
                sortedCategoryBudgets.map((budget) => {
                  const spent = monthSpentByCategory(
                    transactions,
                    budget.categoryId,
                    budgetMonthStartDay,
                  );
                  const percent = budgetUsagePercent(spent, budget.monthlyLimit);
                  const over = spent > budget.monthlyLimit;
                  const label = getCategoryLabel(budget.categoryId, categories, locale);
                  return (
                    <div key={budget.categoryId} data-plan-entity-id={budget.categoryId} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{label}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCategoryBudget(budget.categoryId)}
                        >
                          {t(locale, "planningLimitRemove")}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {replaceTokens(t(locale, "planningLimitSpent"), {
                          spent: formatMoney(spent, locale),
                          limit: formatMoney(budget.monthlyLimit, locale),
                          percent: String(percent),
                        })}
                      </p>
                      {over ? (
                        <p className="text-xs text-destructive">
                          {replaceTokens(t(locale, "planningLimitOver"), {
                            amount: formatMoney(spent - budget.monthlyLimit, locale),
                          })}
                        </p>
                      ) : null}
                      <ProgressBar percent={percent} over={over} />
                    </div>
                  );
                })
              )}
              <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={limitCategoryId}
                  onChange={(e) => setLimitCategoryId(e.target.value)}
                >
                  <option value="">{t(locale, "planningLimitCategory")}</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {getCategoryLabel(c.id, categories, locale)}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  placeholder={t(locale, "planningLimitAmount")}
                  value={limitAmount}
                  onChange={(e) => setLimitAmount(e.target.value)}
                />
                <Button onClick={handleSetLimit}>{t(locale, "planningLimitSet")}</Button>
              </div>
            </TabsContent>
            ) : null}

            {visibleTabs.includes("debts") ? (
            <TabsContent value="debts" className="space-y-3">
              <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/25">
                <div className="flex items-start gap-2">
                  <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {locale === "ru" ? "Долги и обязательства" : "Debts and obligations"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-background/70 px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      {locale === "ru" ? "Остаток" : "Balance"}
                    </p>
                    <p className="font-bold tabular-nums">
                      {formatMoney(debtTotals.balance, locale)}
                    </p>
                  </div>
                  <div className="rounded-md bg-background/70 px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      {locale === "ru" ? "Мин. платёж" : "Min payment"}
                    </p>
                    <p className="font-bold tabular-nums">
                      {formatMoney(debtTotals.minPayment, locale)}
                    </p>
                  </div>
                </div>
                {debtFocus ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {locale === "ru" ? "Фокус: " : "Focus: "}
                    <span className="font-medium text-foreground">{debtFocus.name}</span>
                    {debtFocus.ratePct ? ` · ${debtFocus.ratePct}%` : ""}
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-border/80 bg-background p-2">
                <p className="text-xs font-medium text-foreground">
                  {locale === "ru" ? "Стратегия погашения" : "Repayment strategy"}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {locale === "ru"
                    ? "Выберите один раз — список сам поставит первым долг, который лучше гасить."
                    : "Choose once — the list will place the best debt to pay first."}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {(["avalanche", "snowball"] as DebtItem["strategy"][]).map((strategy) => (
                    <div key={strategy} className="flex min-w-0 rounded-md border border-input bg-muted/30 p-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={debtStrategy === strategy ? "default" : "ghost"}
                        className="min-w-0 flex-1 px-1.5 text-xs"
                        onClick={() => setDebtStrategy(strategy)}
                      >
                        <span className="truncate">{debtStrategyLabel(strategy, locale)}</span>
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-7 shrink-0 text-xs font-bold"
                        aria-label={debtStrategyHelp(strategy, locale)}
                        title={debtStrategyHelp(strategy, locale)}
                        onClick={() => window.alert(debtStrategyHelp(strategy, locale))}
                      >
                        !
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {debts.length > 0 ? (
                sortedDebts.map((debt, index) => {
                  const percentPaid =
                    debt.balance <= 0 ? 100 : debt.minPayment > 0 ? Math.min(100, Math.round((debt.minPayment / debt.balance) * 100)) : 0;
                  const overdue = debt.nextPaymentDate ? debt.nextPaymentDate < todayIso() : false;
                  return (
                    <div key={debt.id} data-plan-entity-id={debt.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium leading-tight">{debt.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {index === 0
                              ? locale === "ru"
                                ? "Гасить первым · "
                                : "Pay first · "
                              : locale === "ru"
                                ? `Очередь ${index + 1} · `
                                : `Order ${index + 1} · `}
                            {debtOwnerLabel(debt.owner, locale)}
                            {debt.ratePct ? ` · ${debt.ratePct}%` : ""}
                          </p>
                          <p className="mt-1 text-sm font-semibold tabular-nums">
                            {formatMoney(debt.balance, locale)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {locale === "ru" ? "Мин. платёж: " : "Min payment: "}
                            {formatMoney(debt.minPayment, locale)}
                            {debt.nextPaymentDate ? ` · ${formatTransactionDate(debt.nextPaymentDate, locale)}` : ""}
                          </p>
                          {overdue ? (
                            <p className="text-xs font-medium text-destructive">
                              {locale === "ru" ? "Платёж просрочен — это первый приоритет." : "Payment is overdue — first priority."}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => startEditDebt(debt)}
                            aria-label={locale === "ru" ? "Редактировать долг" : "Edit debt"}
                            title={locale === "ru" ? "Редактировать долг" : "Edit debt"}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeDebt(debt.id)}
                            aria-label={t(locale, "txDelete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <ProgressBar percent={percentPaid} />
                      {editDebtId === debt.id ? (
                        <div className="space-y-2 rounded-md border border-border/80 bg-background p-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder={locale === "ru" ? "Название долга" : "Debt name"}
                              value={editDebtName}
                              onChange={(e) => setEditDebtName(e.target.value)}
                            />
                            <Input
                              type="number"
                              placeholder={locale === "ru" ? "Остаток" : "Balance"}
                              value={editDebtBalance}
                              onChange={(e) => setEditDebtBalance(e.target.value)}
                            />
                            <Input
                              type="number"
                              placeholder={locale === "ru" ? "Мин. платёж" : "Min payment"}
                              value={editDebtMinPayment}
                              onChange={(e) => setEditDebtMinPayment(e.target.value)}
                            />
                            <Input
                              type="number"
                              placeholder={locale === "ru" ? "Ставка %" : "Rate %"}
                              value={editDebtRate}
                              onChange={(e) => setEditDebtRate(e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <select
                              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                              value={editDebtOwner}
                              onChange={(e) => setEditDebtOwner(e.target.value as DebtItem["owner"])}
                            >
                              <option value="all">{locale === "ru" ? "Общий" : "Shared"}</option>
                              <option value="me">{locale === "ru" ? "Я" : "Me"}</option>
                              <option value="partner">{locale === "ru" ? "Партнёр" : "Partner"}</option>
                            </select>
                            <Input
                              type="date"
                              value={editDebtDate}
                              onChange={(e) => setEditDebtDate(e.target.value)}
                              aria-label={locale === "ru" ? "Дата платежа" : "Payment date"}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1" onClick={() => saveEditDebt(debt)}>
                              {locale === "ru" ? "Сохранить" : "Save"}
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={cancelEditDebt}>
                              {locale === "ru" ? "Отмена" : "Cancel"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {debtPayId === debt.id ? (
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder={locale === "ru" ? "Сумма платежа" : "Payment amount"}
                            value={debtPayAmount}
                            onChange={(e) => setDebtPayAmount(e.target.value)}
                          />
                          <Button size="sm" onClick={() => handleDebtPayment(debt.id)}>
                            OK
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setDebtPayId(debt.id)}>
                          {locale === "ru" ? "Внести платёж" : "Add payment"}
                        </Button>
                      )}
                    </div>
                  );
                })
              ) : null}

              <div className="space-y-2 border-t pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder={locale === "ru" ? "Название долга" : "Debt name"}
                    value={debtName}
                    onChange={(e) => setDebtName(e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder={locale === "ru" ? "Остаток" : "Balance"}
                    value={debtBalance}
                    onChange={(e) => setDebtBalance(e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder={locale === "ru" ? "Мин. платёж" : "Min payment"}
                    value={debtMinPayment}
                    onChange={(e) => setDebtMinPayment(e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder={locale === "ru" ? "Ставка %" : "Rate %"}
                    value={debtRate}
                    onChange={(e) => setDebtRate(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={debtOwner}
                    onChange={(e) => setDebtOwner(e.target.value as DebtItem["owner"])}
                  >
                    <option value="all">{locale === "ru" ? "Общий" : "Shared"}</option>
                    <option value="me">{locale === "ru" ? "Я" : "Me"}</option>
                    <option value="partner">{locale === "ru" ? "Партнёр" : "Partner"}</option>
                  </select>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {locale === "ru" ? "Напоминание: дата платежа" : "Reminder: payment date"}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 rounded-full text-xs font-semibold"
                        aria-label={
                          locale === "ru"
                            ? "Что значит дата платежа"
                            : "What payment date means"
                        }
                        title={
                          locale === "ru"
                            ? "Что значит дата платежа"
                            : "What payment date means"
                        }
                        onClick={() =>
                          window.alert(
                            locale === "ru"
                              ? "Это дата ближайшего обязательного платежа или день, когда долг нужно отдать. По этой дате приложение подсветит просрочку, чтобы не пропустить срок."
                              : "This is the next required payment date or the date when the debt is due. The app will highlight overdue payments based on this date.",
                          )
                        }
                      >
                        !
                      </Button>
                    </div>
                    <Input
                      type="date"
                      value={debtDate}
                      onChange={(e) => setDebtDate(e.target.value)}
                      aria-label={
                        locale === "ru"
                          ? "Напоминание: дата платежа"
                          : "Reminder: payment date"
                      }
                    />
                  </div>
                </div>
                <Button className="w-full" onClick={handleAddDebt}>
                  {locale === "ru" ? "Добавить долг" : "Add debt"}
                </Button>
              </div>
            </TabsContent>
            ) : null}

            {visibleTabs.includes("emergency") ? (
            <TabsContent value="emergency" className="space-y-3">
              <p className="text-sm text-muted-foreground">{t(locale, "planningEmergencyHint")}</p>
              <p className="text-sm">
                {replaceTokens(t(locale, "planningEmergencyAvg"), {
                  amount: formatMoney(avgMonthly, locale),
                })}
              </p>
              {!emergencyGoal ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => enableEmergencyFund(3)}>
                    <Shield className="mr-2 h-4 w-4" />
                    {t(locale, "planningEmergencyEnable")} — {t(locale, "planningEmergencyMonths3")}
                  </Button>
                  <Button variant="outline" onClick={() => enableEmergencyFund(6)}>
                    {t(locale, "planningEmergencyMonths6")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium">{t(locale, "planningEmergencyTitle")}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground"
                      onClick={() => setEmergencyInfoOpen((open) => !open)}
                      aria-label={t(locale, "planningEmergencyInfoAria")}
                    >
                      <CircleAlert className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  {emergencyInfoOpen ? (
                    <div className="rounded-md border border-border/70 bg-muted/40 p-2.5 text-xs leading-snug text-muted-foreground">
                      {t(locale, "planningEmergencyInfo")}
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {emergencyGoal.emergencyMonths === 3
                      ? t(locale, "planningEmergencyMonths3")
                      : t(locale, "planningEmergencyMonths6")}
                  </p>
                  {(() => {
                    const target = emergencyTargetAmount(
                      transactions,
                      emergencyGoal.emergencyMonths ?? 6,
                    );
                    const percent =
                      target > 0 ? Math.min(100, Math.round((emergencyGoal.savedAmount / target) * 100)) : 0;
                    return (
                      <>
                        <p className="text-sm">
                          {replaceTokens(t(locale, "planningEmergencyTarget"), {
                            amount: formatMoney(target, locale),
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {replaceTokens(t(locale, "planningGoalSaved"), {
                            saved: formatMoney(emergencyGoal.savedAmount, locale),
                            target: formatMoney(target, locale),
                            percent: String(percent),
                          })}
                        </p>
                        <ProgressBar percent={percent} />
                      </>
                    );
                  })()}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => enableEmergencyFund(3)}
                    >
                      {t(locale, "planningEmergencyMonths3")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => enableEmergencyFund(6)}
                    >
                      {t(locale, "planningEmergencyMonths6")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setDepositGoalMode("deposit");
                        setDepositGoalId(EMERGENCY_GOAL_ID);
                        if (!depositAmount) setDepositGoalId(EMERGENCY_GOAL_ID);
                      }}
                    >
                      {t(locale, "planningGoalDeposit")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={emergencyGoal.savedAmount <= 0}
                      onClick={() => {
                        setDepositGoalMode("withdraw");
                        setDepositGoalId(EMERGENCY_GOAL_ID);
                      }}
                    >
                      {t(locale, "planningGoalWithdraw")}
                    </Button>
                  </div>
                  {depositGoalId === EMERGENCY_GOAL_ID ? (
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder={t(locale, "planningGoalDepositAmount")}
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                      />
                      <Button size="sm" onClick={() => handleGoalTransfer(EMERGENCY_GOAL_ID)}>
                        OK
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </TabsContent>
            ) : null}

            {visibleTabs.includes("recurring") ? (
            <TabsContent value="recurring" className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t(locale, "planningRecurringHint")}
              </p>
              {plannedFutureOperations.currentMonth.length === 0 &&
              plannedFutureOperations.laterMonths.length === 0 &&
              futureOperationSections.due.length === 0 &&
              futureOperationSections.paid.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t(locale, "planningRecurringEmpty")}</p>
              ) : (
                futureOperationDisplaySections.map((section) => (
                  <div key={section.key} className="space-y-2">
                    {(() => {
                      const isFutureMonthSection = Boolean(section.compactLabel);
                      const isExpanded = expandedFutureMonths[section.key] ?? false;
                      const ToggleIcon = isExpanded ? ChevronUp : ChevronDown;
                      return (
                        <>
                          {isFutureMonthSection ? (
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/90 px-3.5 py-2 text-left transition-colors hover:bg-accent/40"
                              onClick={() =>
                                setExpandedFutureMonths((current) => ({
                                  ...current,
                                  [section.key]: !isExpanded,
                                }))
                              }
                              aria-expanded={isExpanded}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="inline-flex min-h-8 items-center rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-sm font-semibold tracking-[0.08em] text-emerald-900 shadow-sm dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-100">
                                  {section.label}
                                </p>
                                <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/80 shadow-sm">
                                  {section.compactLabel}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                                <span className="text-xs font-medium">
                                  {locale === "ru"
                                    ? `${section.items.length} ${section.items.length === 1 ? "операция" : "операции"}`
                                    : `${section.items.length} items`}
                                </span>
                                <ToggleIcon className="h-4 w-4" />
                              </div>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="inline-flex min-h-8 items-center rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-sm font-semibold tracking-[0.08em] text-emerald-900 shadow-sm dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-100">
                                {section.label}
                              </p>
                            </div>
                          )}
                          {!isFutureMonthSection || isExpanded
                            ? section.items.map(renderFutureOperationCard)
                            : null}
                        </>
                      );
                    })()}
                  </div>
                ))
              )}
              <div className="space-y-2 border-t pt-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {locale === "ru" ? "Добавить операцию" : "Add operation"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {recRepeat === "once"
                      ? locale === "ru"
                        ? "Операция появится в прогнозе и потребует подтверждения в выбранную дату."
                        : "The operation will appear in Forecast and will need confirmation on the selected date."
                      : locale === "ru"
                        ? "Будет создано регулярное правило."
                        : "A recurring rule will be created."}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      {locale === "ru" ? "Тип" : "Type"}
                    </span>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={recType}
                      onChange={(e) => setRecType(e.target.value as TxType)}
                      aria-label={locale === "ru" ? "Тип операции" : "Operation type"}
                    >
                      <option value="expense">{locale === "ru" ? "Расход" : "Expense"}</option>
                      <option value="income">{locale === "ru" ? "Доход" : "Income"}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      {t(locale, "planningRecurringAmount")}
                    </span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={recAmount}
                      onChange={(e) => setRecAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      {locale === "ru" ? "Название" : "Name"}
                    </span>
                    <Input
                      placeholder={locale === "ru" ? "Например, ОСАГО" : "For example, insurance"}
                      value={recNote}
                      onChange={(e) => setRecNote(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      {locale === "ru" ? "Категория" : "Category"}
                    </span>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={recCategoryId}
                      onChange={(e) => setRecCategoryId(e.target.value)}
                      aria-label={locale === "ru" ? "Категория" : "Category"}
                    >
                      {recurringFormCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {getCategoryLabel(category.id, categories, locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      {locale === "ru" ? "Повторение" : "Repeat"}
                    </span>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={recRepeat}
                      onChange={(e) => {
                        const next = e.target.value as "once" | RecurringFrequency;
                        setRecRepeat(next);
                        if (next !== "monthly" && recEndMode === "months") {
                          setRecEndMode("never");
                        }
                        if (next === "once") {
                          setRecEndMode("never");
                          setRecEndDate("");
                        }
                      }}
                      aria-label={locale === "ru" ? "Повторение" : "Repeat"}
                    >
                      <option value="once">{locale === "ru" ? "Один раз" : "One time"}</option>
                      <option value="weekly">{locale === "ru" ? "Каждую неделю" : "Every week"}</option>
                      <option value="monthly">{locale === "ru" ? "Каждый месяц" : "Every month"}</option>
                      <option value="yearly">{locale === "ru" ? "Каждый год" : "Every year"}</option>
                    </select>
                  </div>
                  <Input
                    type="date"
                    className="w-full"
                    ref={recStartDateInputRef}
                    defaultValue={recStartDate}
                    onChange={(e) => handleRecStartDateInput(e.currentTarget.value)}
                    onInput={(e) => handleRecStartDateInput(e.currentTarget.value)}
                    aria-label={locale === "ru" ? "Дата первой операции" : "First operation date"}
                  />
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      {locale === "ru" ? "Комментарий" : "Comment"}
                    </span>
                    <Input
                      placeholder={locale === "ru" ? "Необязательно" : "Optional"}
                      value={recComment}
                      onChange={(e) => setRecComment(e.target.value)}
                    />
                  </div>
                  {recRepeat !== "once" ? (
                  <div className="w-full space-y-2 rounded-md border border-border/70 p-3">
	                    <p className="text-xs font-medium text-foreground">
	                      {locale === "ru" ? "Когда закончится?" : "When should it end?"}
	                    </p>
	                    <div className="grid grid-cols-1 gap-2">
	                      <Button
	                        type="button"
	                        variant={recEndMode === "never" ? "default" : "outline"}
	                        className="justify-start"
	                        onClick={() => setRecEndMode("never")}
	                      >
	                        {locale === "ru" ? "Без срока" : "No end date"}
	                      </Button>
	                      <Button
	                        type="button"
	                        variant={recEndMode === "date" ? "default" : "outline"}
	                        className="justify-start"
	                        onClick={() => setRecEndMode("date")}
	                      >
	                        {locale === "ru" ? "До даты" : "Until date"}
	                      </Button>
	                      {recRepeat === "monthly" ? (
	                        <Button
	                          type="button"
	                          variant={recEndMode === "months" ? "default" : "outline"}
	                          className="justify-start"
	                          onClick={() => setRecEndMode("months")}
	                        >
	                          {locale === "ru" ? "Через несколько месяцев" : "After several months"}
	                        </Button>
	                      ) : null}
	                    </div>
	                    {recEndMode === "date" ? (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">
                            {locale === "ru" ? "Дата окончания" : "End date"}
                          </span>
                          <Input
                            type="date"
                            value={recEndDate}
                            onChange={(e) => setRecEndDate(e.target.value)}
                          />
                        </div>
                      ) : null}
	                    {recEndMode === "months" && recRepeat === "monthly" ? (
	                      <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">
                            {locale === "ru" ? "Количество месяцев" : "Months count"}
                          </span>
	                        <Input
	                          type="number"
	                          min="1"
	                          max="120"
	                          value={recDurationMonths}
	                          onChange={(e) => setRecDurationMonths(e.target.value)}
	                        />
	                        {recurringEndPreview ? (
	                          <p className="text-xs text-muted-foreground">
	                            {locale === "ru"
	                              ? `Последний платёж: ${formatTransactionDate(recurringEndPreview, locale)}`
	                              : `Last payment: ${formatTransactionDate(recurringEndPreview, locale)}`}
	                          </p>
	                        ) : null}
	                      </div>
	                    ) : null}
                  </div>
                  ) : null}
                  <Button className="w-full" onClick={handleAddRecurring}>
                    {locale === "ru" ? "Добавить операцию" : "Add operation"}
                  </Button>
                </div>
              </div>
            </TabsContent>
            ) : null}

            {visibleTabs.includes("stats") ? (
            <TabsContent value="stats" className="space-y-3">
              <FinancialChart collapsible={false} />
            </TabsContent>
            ) : null}

            {visibleTabs.includes("advisor") ? (
            <TabsContent value="advisor" className="space-y-3">
              <AiAnalysisTab active={currentPlanningTab === "advisor"} />
            </TabsContent>
            ) : null}
          </Tabs>
        </CardContent>
      ) : null}
    </Card>
  );
}
