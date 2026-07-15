"use client";

import { CheckCircle2, ChevronRight, Circle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HouseholdCloudPanel } from "@/components/HouseholdCloudPanel";
import { MoneySetupDialog } from "@/components/MoneySetupDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppTabId } from "@/lib/app-bottom-nav";
import type { PlanSection } from "@/lib/plan-navigation";
import { hasPartnerBudget } from "@/lib/owner-labels";
import { useCloudStore } from "@/store/useCloudStore";
import { useStore } from "@/store/useStore";

const ONBOARDING_KEY = "finos-first-launch-onboarding-v1";

type StepId = "email" | "income" | "payments" | "limits" | "summary";
type StepStatus = "done" | "current" | "upcoming";

const STEP_ORDER: StepId[] = ["email", "income", "payments", "limits", "summary"];

function readDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "done";
  } catch {
    return false;
  }
}

function writeDone(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, "done");
  } catch {
    /* ignore */
  }
}

export function FirstLaunchOnboardingDialog({
  onNavigate,
}: {
  onNavigate: (
    tab: AppTabId,
    options?: {
      planSection?: PlanSection;
      entityId?: string | null;
    },
  ) => void;
}) {
  const locale = useStore((s) => s.locale);
  const moneySetup = useStore((s) => s.moneySetup);
  const recurringTransactions = useStore((s) => s.recurringTransactions);
  const categoryBudgets = useStore((s) => s.categoryBudgets);
  const transactions = useStore((s) => s.transactions);
  const partnerName = useStore((s) => s.partnerName);
  const partnerKeywords = useStore((s) => s.partnerKeywords);
  const token = useCloudStore((s) => s.token);
  const household = useCloudStore((s) => s.household);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<StepId>("email");
  const [moneySetupOpen, setMoneySetupOpen] = useState(false);

  const showHouseholdToggle = hasPartnerBudget(partnerName, partnerKeywords);

  const stepDone = useMemo(
    () => ({
      email: Boolean(token && household),
      income:
        moneySetup.incomeSources.length > 0 ||
        Boolean(moneySetup.nextIncomeDate) ||
        Boolean(moneySetup.expectedIncomeAmount),
      payments:
        recurringTransactions.some((item) => item.type === "expense" && item.enabled) ||
        moneySetup.hasNoRequiredFixedExpenses,
      limits:
        categoryBudgets.some((item) => item.monthlyLimit > 0) ||
        moneySetup.essentialCategoryIds.length > 0,
    }),
    [categoryBudgets, household, moneySetup, recurringTransactions, token],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasAnyData =
      transactions.length > 0 ||
      recurringTransactions.length > 0 ||
      categoryBudgets.length > 0 ||
      moneySetup.incomeSources.length > 0 ||
      Boolean(moneySetup.nextIncomeDate);
    if (!useStore.persist.hasHydrated()) return;
    if (readDone()) return;
    if (hasAnyData && stepDone.email) return;
    setOpen(true);
  }, [categoryBudgets.length, moneySetup, recurringTransactions.length, stepDone.email, transactions.length]);

  useEffect(() => {
    if (step === "email" && stepDone.email) {
      setStep("income");
      return;
    }
    if (step === "income" && stepDone.income) {
      setStep("payments");
      return;
    }
    if (step === "payments" && stepDone.payments) {
      setStep("limits");
      return;
    }
    if (step === "limits" && stepDone.limits) {
      setStep("summary");
    }
  }, [step, stepDone]);

  const summaryReady = stepDone.email && stepDone.income && stepDone.payments && stepDone.limits;

  const stepMeta: Array<{ id: StepId; title: string; body: string; status: StepStatus }> = STEP_ORDER.map((id) => {
    const currentIndex = STEP_ORDER.indexOf(step);
    const index = STEP_ORDER.indexOf(id);
    let status: StepStatus = "upcoming";
    if (
      (id === "email" && stepDone.email) ||
      (id === "income" && stepDone.income) ||
      (id === "payments" && stepDone.payments) ||
      (id === "limits" && stepDone.limits) ||
      (id === "summary" && summaryReady)
    ) {
      status = "done";
    } else if (index === currentIndex) {
      status = "current";
    }

    if (id === "email") {
      return {
        id,
        title: locale === "ru" ? "Вход и синхронизация" : "Sign in and sync",
        body:
          locale === "ru"
            ? "Подключите email, чтобы одни и те же данные были на телефоне и компьютере."
            : "Connect your email so the same data stays on your phone and computer.",
        status,
      };
    }
    if (id === "income") {
      return {
        id,
        title: locale === "ru" ? "Доходы" : "Income",
        body:
          locale === "ru"
            ? "Добавьте ближайший доход или несколько регулярных поступлений."
            : "Add your next income or several recurring payouts.",
        status,
      };
    }
    if (id === "payments") {
      return {
        id,
        title: locale === "ru" ? "Обязательные платежи" : "Required payments",
        body:
          locale === "ru"
            ? "Укажите аренду, кредиты и другие повторяющиеся платежи."
            : "Add rent, loans, and other recurring payments.",
        status,
      };
    }
    if (id === "limits") {
      return {
        id,
        title: locale === "ru" ? "Лимиты и базовые траты" : "Limits and basic spending",
        body:
          locale === "ru"
            ? "Отметьте лимиты, которые должны участвовать в плане денег."
            : "Mark the limits that should be part of your money plan.",
        status,
      };
    }
    return {
      id,
      title: locale === "ru" ? "Итоговый план" : "Final plan",
      body:
        locale === "ru"
          ? "Проверьте базу и переходите на Today."
          : "Review your setup and continue to Today.",
      status,
    };
  });

  const finish = () => {
    writeDone();
    setOpen(false);
    onNavigate("today");
  };

  const currentCard = stepMeta.find((item) => item.id === step) ?? stepMeta[0];

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {locale === "ru" ? "Первый финансовый план" : "Your first money plan"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-3">
              {stepMeta.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <div className="pt-0.5">
                    {item.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : item.status === "current" ? (
                      <ChevronRight className="h-4 w-4 text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{currentCard.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{currentCard.body}</p>
              </div>

              {step === "email" ? <HouseholdCloudPanel embedded /> : null}

              {step === "income" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {locale === "ru"
                      ? "Здесь лучше использовать существующий экран финансовой базы: он уже умеет добавлять текущий остаток и ожидаемые доходы."
                      : "Use the existing money setup flow here: it already supports current balance and expected income."}
                  </p>
                  <Button type="button" className="w-full" onClick={() => setMoneySetupOpen(true)}>
                    {locale === "ru" ? "Добавить доходы" : "Add income"}
                  </Button>
                </div>
              ) : null}

              {step === "payments" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {locale === "ru"
                      ? "Откроем раздел, где добавляются регулярные платежи и долги, чтобы прогноз сразу видел будущие обязательства."
                      : "Open the section where recurring payments and debts are added so the forecast sees future obligations."}
                  </p>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => onNavigate("plan", { planSection: "recurring" })}
                  >
                    {locale === "ru" ? "Открыть регулярные платежи" : "Open recurring payments"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => onNavigate("plan", { planSection: "debts" })}
                  >
                    {locale === "ru" ? "Открыть долги" : "Open debts"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      useStore.getState().updateMoneySetup({ hasNoRequiredFixedExpenses: true });
                      setStep("limits");
                    }}
                  >
                    {locale === "ru" ? "У меня нет обязательных платежей" : "I have no required payments"}
                  </Button>
                </div>
              ) : null}

              {step === "limits" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {locale === "ru"
                      ? "Лимиты на продукты, бензин и другие базовые траты помогут сделать план денег реалистичным."
                      : "Limits for groceries, fuel, and other basics make the money plan realistic."}
                  </p>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => onNavigate("plan", { planSection: "limits" })}
                  >
                    {locale === "ru" ? "Открыть лимиты" : "Open limits"}
                  </Button>
                </div>
              ) : null}

              {step === "summary" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {summaryReady
                      ? locale === "ru"
                        ? "База готова: теперь Today, прогноз и советник будут работать от ваших данных."
                        : "Your base is ready: Today, forecast, and advisor can now work from your real data."
                      : locale === "ru"
                        ? "Если хотите, можно закончить позже. Уже добавленное сохранится."
                        : "You can finish later if you want. Everything already added will stay saved."}
                  </p>
                  <Button type="button" className="w-full" onClick={finish}>
                    {locale === "ru" ? "Перейти в Today" : "Go to Today"}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={finish}>
                {locale === "ru" ? "Пропустить пока" : "Skip for now"}
              </Button>
              {step !== "summary" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const nextIndex = Math.min(STEP_ORDER.length - 1, STEP_ORDER.indexOf(step) + 1);
                    setStep(STEP_ORDER[nextIndex] ?? "summary");
                  }}
                >
                  {locale === "ru" ? "Дальше" : "Next"}
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MoneySetupDialog
        open={moneySetupOpen}
        onOpenChange={setMoneySetupOpen}
        showHouseholdToggle={showHouseholdToggle}
        initialSection="income"
      />
    </>
  );
}
