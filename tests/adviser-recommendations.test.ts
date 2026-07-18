import assert from "node:assert/strict";
import test from "node:test";
import { getAdvisorSystemPrompt } from "@/lib/ai/advisor-system-prompt";
import type { FinancialAdviserBrief } from "@/lib/adviser/financial-analysis-engine";

function makeBrief(): FinancialAdviserBrief {
  return {
    questionType: "cashflow_delay",
    summary: {
      headline: "При задержке дохода на 7 дней критической проблемы сейчас нет, но риск смещается на конец сентября.",
      currentBalance: 97494,
      plannedFreeMoney: 42816,
      periodEndDate: "2026-07-31",
      forecastRisk: "medium",
    },
    cashFlow: {
      monthlyIncome: 150000,
      monthlyExpenses: 140000,
      freeCashFlow: 10000,
      savingsRate: 7,
    },
    financialHealth: {
      liquidityScore: 44,
      debtLoad: 12,
      incomeStability: "medium",
      riskLevel: "medium",
    },
    expectedIncome: [
      {
        id: "salary-main",
        name: "Трудовая",
        amount: 43000,
        date: "2026-07-20",
        status: "expected",
      },
    ],
    upcomingRisks: [
      {
        date: "2026-09-29",
        type: "income_delay_scenario",
        amount: -13972,
        reason: "Риск появляется, если доход сдвинется на неделю.",
      },
    ],
    expensePressure: [
      { name: "Аренда", amount: 53000, kind: "recurring_payment" },
      { name: "Продукты", amount: 30000, kind: "spending_limit" },
    ],
    debtFocus: [],
    goals: {
      activeGoals: 1,
      requiredAmount: 500000,
      timeline: ["2026-12-31"],
    },
    purchaseAnalysis: null,
    scenarioAnalysis: null,
    missingInputs: [],
    recommendedActions: [
      {
        priority: 2,
        action: "move_optional_payments",
        reason: "Сначала лучше сдвинуть необязательные траты, а не искать кредит.",
      },
      {
        priority: 4,
        action: "use_reserve",
        reason: "Если доход реально задержится, резерв даст время без кассового разрыва.",
      },
    ],
    evidence: [
      "Ожидаемый доход Трудовая: 43 000 ₽, дата 20.07.2026.",
      "Дата риска по сценарию: 29.09.2026.",
    ],
  };
}

test("advisor prompt for v3 requires conclusion first, causality, and actions", () => {
  const prompt = getAdvisorSystemPrompt({
    locale: "ru",
    cards: [{ label: "Можно потратить", value: "42 816 ₽", note: "До конца периода." }],
    financialBrief: makeBrief(),
  });

  assert.match(prompt, /Начинай ответ с вывода/);
  assert.match(prompt, /Причинно-следственную связь/iu);
  assert.match(prompt, /Нельзя советовать кредит, займ или одалживание денег/);
  assert.match(prompt, /Приоритет рекомендаций всегда идёт сверху вниз/);
  assert.match(prompt, /Итог:/);
  assert.match(prompt, /Что делать:/);
});
