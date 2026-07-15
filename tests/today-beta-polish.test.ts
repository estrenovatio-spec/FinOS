import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { APP_BOTTOM_NAV_TABS } from "@/components/app/AppBottomNav";
import { buildMoneySetupBalanceSectionView } from "@/components/MoneySetupDialog";
import { buildFocusedForecastView } from "@/components/app/focused-forecast-presenter";
import { buildMoneySetupProgress } from "@/components/today/money-setup-progress";
import { buildTodayScreenView, isTodayZeroState } from "@/components/today/today-screen-presenter";
import { getDefaultCategories } from "@/lib/categories";
import { emptyMoneySetup } from "@/lib/money-setup";
import type { BalanceForecast, DecisionCoreResult } from "@/lib/decision-core/types";
import { ChartColumn, House, ReceiptText } from "lucide-react";
import { useStore } from "@/store/useStore";

function makeDecision(
  partial?: Partial<DecisionCoreResult>,
): DecisionCoreResult {
  return {
    status: {
      key: "action",
      title: "Требуется действие",
      toneClassName: "border-primary/25 bg-primary/5",
      note: undefined,
    },
    safeUntil: {
      status: "constraint_found",
      title: "До 25.07.2026",
      note: "Расчёт по прогнозной линии.",
      isReady: true,
      needsSetup: false,
      rawStatus: "ready",
      safeToday: 3500,
      nextIncomeDate: "2026-07-25",
      nextIncomeTitle: "Зарплата",
      nextIncomeAmount: 90000,
      horizonEndDate: "2026-08-10",
      horizonMonths: 3,
      confidence: "confirmed",
    },
    todayPayments: [],
    nextRisk: null,
    mainAction: {
      type: "hold",
      title: "Срочных действий нет",
      text: "Сегодня обязательных действий нет.",
      description: "Прогноз остаётся устойчивым на известном горизонте.",
      reason: "Система не нашла обязательного шага сильнее, чем сохранение резерва.",
      amount: null,
      dueDate: "2026-07-25",
      relatedEntityId: null,
      priority: "low",
      command: { type: "none" },
    },
    avoid: { text: null, reason: null },
    allowed: {
      text: "Можно потратить сегодня до 3 500 ₽ без риска для прогноза.",
      hasRestPermission: true,
      status: "available",
      amount: 3500,
      horizonDate: "2026-07-25",
      reason: "Это сумма сверх обязательств и резерва.",
    },
    constraintExplanation: null,
    peaceIndex: {
      value: 72,
      note: "Прогноз остаётся устойчивым.",
    },
    hasHistory: true,
    ...partial,
  };
}

function makeForecast(partial?: Partial<BalanceForecast>): BalanceForecast {
  return {
    startBalance: 12000,
    minBalance: -8500,
    minBalanceDate: "2026-07-27",
    firstDeficitDate: "2026-07-27",
    nextIncomeDate: "2026-07-30",
    horizonEndDate: "2026-08-10",
    horizonMonths: 3,
    events: [
      {
        id: "rent-2026-07-27",
        title: "Аренда",
        amount: -50000,
        date: "2026-07-27",
        balanceAfter: -8500,
        source: "recurring",
      },
      {
        id: "salary-2026-07-27",
        title: "Зарплата",
        amount: 120000,
        date: "2026-07-27",
        balanceAfter: 111500,
        source: "income_source",
      },
      {
        id: "credit-2026-07-27",
        title: "Кредит",
        amount: -19000,
        date: "2026-07-27",
        balanceAfter: 92500,
        source: "debt_payment",
      },
    ],
    ...partial,
  };
}

test("empty user is recognized as Today Zero", () => {
  assert.equal(
    isTodayZeroState({
      decision: makeDecision({
        hasHistory: false,
        allowed: {
          text: "Можно прожить день спокойно, но без новых трат.",
          hasRestPermission: true,
          status: "unknown",
          amount: null,
          horizonDate: null,
          reason: "Нельзя надёжно посчитать безопасную сумму.",
        },
      }),
      locale: "ru",
      transactionCount: 0,
      moneySetup: emptyMoneySetup(),
      balances: { all: 0, me: 0, partner: 0 },
    }),
    true,
  );
});

test("empty user sees one primary setup action and no fake analytics", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({ hasHistory: false }),
    locale: "ru",
    transactionCount: 0,
    moneySetup: emptyMoneySetup(),
    balances: { all: 0, me: 0, partner: 0 },
  });

  assert.equal(view.hero.isEmptyState, true);
  assert.equal(view.hero.ctaLabel, "Указать остаток");
  assert.equal(view.overviewItems.length, 1);
  assert.equal(view.overviewItems[0]?.label, "Сейчас в кошельке");
  assert.equal(view.overviewItems[0]?.value, "Текущий остаток не указан");
});

test("hero shows executable CTA for income setup", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "complete_income_setup",
        title: "Добавьте ближайший доход",
        text: "Добавьте дату и сумму ближайшего дохода.",
        description: "Без этого прогноз не может честно ответить, на сколько хватит денег.",
        reason: "Сейчас системе не хватает ключевых данных о поступлениях.",
        priority: "high",
        command: { type: "open_money_setup", scope: "income" },
      },
      allowed: {
        text: "Можно прожить день спокойно, но без новых трат.",
        hasRestPermission: true,
        status: "unknown",
        amount: null,
        horizonDate: null,
        reason: "Нельзя надёжно посчитать безопасную сумму без ключевых данных.",
      },
    }),
    locale: "ru",
    transactionCount: 1,
    moneySetup: emptyMoneySetup(),
    balances: { all: 25000, me: 25000, partner: 0 },
  });

  assert.equal(view.hero.title, "Добавьте ближайший доход");
  assert.equal(view.hero.ctaLabel, "Добавить доход");
  assert.equal(view.hero.amount, null);
  assert.match(view.hero.reason ?? "", /нельзя точно сказать/);
});

test("expected income hero shows confirm and skip actions", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "confirm_income",
        title: "Сегодня ожидается доход",
        text: "Ожидается поступление",
        description: "Подтвердите факт или пропустите ожидание.",
        reason: "Прогноз уже учитывает этот доход как план.",
        amount: 24000,
        dueDate: "2026-07-14",
        relatedEntityId: "salary-main",
        priority: "high",
        command: {
          type: "confirm_income_source",
          incomeSourceId: "salary-main",
          incomeTitle: "Зарплата",
          plannedDate: "2026-07-14",
          plannedAmount: 24000,
          status: "due_today",
        },
      },
    }),
    locale: "ru",
    transactionCount: 3,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-14",
      expectedIncomeAmount: 24000,
    },
    balances: { all: 40000, me: 40000, partner: 0 },
  });

  assert.equal(view.hero.ctaLabel, "Получил");
  assert.equal(view.hero.secondaryCtaLabel, "Не пришёл");
});

test("hero without urgent action does not show forced CTA", () => {
  const view = buildTodayScreenView({
    decision: makeDecision(),
    locale: "ru",
    transactionCount: 3,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
      expectedIncomeAmount: 90000,
    },
    balances: { all: 40000, me: 40000, partner: 0 },
  });

  assert.equal(view.hero.ctaLabel, null);
  assert.match(view.hero.due ?? "", /25\.07\.2026/);
  assert.equal(view.hero.title, "Всё спокойно");
  assert.equal(view.hero.amount, null);
});

test("hero keeps the same canonical date even without a separate safe-until card", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      safeUntil: {
        status: "constraint_found",
        title: "До 03.08.2026",
        note: "Расчёт по прогнозной линии.",
        isReady: true,
        needsSetup: false,
        rawStatus: "ready",
        safeToday: 3500,
        nextIncomeDate: "2026-08-10",
        nextIncomeTitle: "Зарплата",
        nextIncomeAmount: 90000,
        horizonEndDate: "2026-08-10",
        horizonMonths: 3,
        confidence: "confirmed",
      },
      mainAction: {
        type: "hold",
        title: "Срочных действий нет",
        text: "Сегодня обязательных действий нет.",
        description: "Прогноз остаётся устойчивым на известном горизонте.",
        reason: "Система не нашла обязательного шага сильнее, чем сохранение резерва.",
        amount: null,
        dueDate: "2026-07-25",
        relatedEntityId: null,
        priority: "low",
        command: { type: "none" },
      },
      nextRisk: null,
    }),
    locale: "ru",
    transactionCount: 3,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-08-10",
    },
    balances: { all: 40000, me: 40000, partner: 0 },
  });

  const safeUntil = view.overviewItems.find((item) => item.id === "safe-until");
  assert.equal(safeUntil, undefined);
  assert.equal(view.hero.due, "Денег хватает до 03.08.2026");
  assert.doesNotMatch(view.hero.due ?? "", /25\.07\.2026/);
});

test("Today overview no longer duplicates forecast horizon or next income cards", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      safeUntil: {
        status: "no_risk_in_horizon",
        title: "На ближайшие 3 месяца всё спокойно",
        note: "До 13 октября дефицита не ожидается. С учётом ожидаемого дохода 14.07.2026.",
        isReady: true,
        needsSetup: false,
        rawStatus: "ready",
        safeToday: 18000,
        nextIncomeDate: "2026-07-14",
        nextIncomeTitle: "Пассив",
        nextIncomeAmount: 24000,
        horizonEndDate: "2026-10-13",
        horizonMonths: 3,
        confidence: "planned",
        confidenceNote: "С учётом ожидаемого дохода 14.07.2026.",
      },
      mainAction: {
        type: "hold",
        title: "Срочных действий нет",
        text: "Сегодня обязательных действий нет.",
        description: "Прогноз остаётся устойчивым на известном горизонте.",
        reason: "Система не нашла обязательного шага сильнее, чем сохранение резерва.",
        amount: null,
        dueDate: "2026-10-13",
        relatedEntityId: null,
        priority: "low",
        command: { type: "none" },
      },
      nextRisk: null,
      allowed: {
        text: "Можно потратить сегодня до 18 000 ₽ без риска для прогноза.",
        hasRestPermission: true,
        status: "available",
        amount: 18000,
        horizonDate: "2026-10-13",
        reason: "Это сумма сверх обязательств.",
        confidence: "planned",
        confidenceNote: "С учётом ожидаемого дохода 14.07.2026.",
      },
    }),
    locale: "ru",
    transactionCount: 3,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-14",
      expectedIncomeAmount: 24000,
    },
    balances: { all: 83651, me: 83651, partner: 0 },
  });

  assert.equal(view.hero.due, "На ближайшие 3 месяца всё спокойно");
  assert.equal(view.overviewItems.find((item) => item.id === "safe-until"), undefined);
  assert.equal(view.overviewItems.find((item) => item.id === "next-income"), undefined);
});

test("current balance is always visible when known", () => {
  const view = buildTodayScreenView({
    decision: makeDecision(),
    locale: "ru",
    transactionCount: 2,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    balances: { all: 40000, me: 40000, partner: 0 },
  });

  const currentBalance = view.overviewItems.find((item) => item.id === "current-balance");
  assert.equal(currentBalance?.label, "Сейчас в кошельке");
  assert.match(currentBalance?.value ?? "", /40[\s\u00A0]000 ₽/);
  assert.equal(currentBalance?.actionLabel, "Изменить");
  assert.equal(currentBalance?.actionKey, "edit_current_balance");
});

test("Today overview shows only current balance and planned free money", () => {
  const view = buildTodayScreenView({
    decision: makeDecision(),
    locale: "ru",
    transactionCount: 2,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    balances: { all: 40000, me: 40000, partner: 0 },
    freeMoney: {
      status: "available",
      amount: 3500,
      periodEndDate: "2026-08-13",
      breakdown: {
        currentActualBalance: 40000,
        recurringPayments: 0,
        otherMandatoryPayments: 12000,
        mandatoryPayments: 12000,
        essentialPlannedSpending: 24500,
        otherRequiredExpenses: 0,
        freeMoney: 3500,
        periodEndDate: "2026-08-13",
      },
      note: null,
    },
    plannedFreeMoney: {
      status: "available",
      amount: 11592,
      expectedRecurringIncome: 24000,
      includesUnconfirmedIncome: false,
      periodStartDate: "2026-07-13",
      periodEndDate: "2026-08-13",
      breakdown: {
        currentActualBalance: 40000,
        expectedRecurringIncome: 24000,
        recurringPayments: 12000,
        otherMandatoryPayments: 0,
        mandatoryPayments: 12000,
        essentialPlannedSpending: 40408,
        otherRequiredExpenses: 0,
        plannedFreeMoney: 11592,
        periodStartDate: "2026-07-13",
        periodEndDate: "2026-08-13",
      },
      note: null,
    },
  });

  assert.equal(view.overviewItems.length, 2);
  const allowed = view.overviewItems.find((item) => item.id === "allowed");
  assert.equal(allowed, undefined);
  const planned = view.overviewItems.find((item) => item.id === "planned-free-money");
  assert.equal(planned?.label, "Можно потратить");
  assert.equal(planned?.subtitle, "до 13 августа 2026");
  assert.match(planned?.value ?? "", /11[\s\u00A0]592 ₽/);
  assert.equal(planned?.layout, "wide");
  assert.equal(planned?.details?.at(-1)?.value, "11 592 ₽");
});

test("planned free money card uses digital dates and keeps breakdown details", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      allowed: {
        text: "Можно потратить сегодня до 34 418 ₽ без риска для прогноза.",
        hasRestPermission: true,
        status: "available",
        amount: 3320,
        horizonDate: "2026-08-03",
        reason: "Это сумма сверх обязательств и резерва.",
        confidence: "confirmed",
      },
    }),
    locale: "ru",
    transactionCount: 5,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    balances: { all: 40000, me: 40000, partner: 0 },
    plannedFreeMoney: {
      status: "available",
      amount: 3320,
      expectedRecurringIncome: 5000,
      includesUnconfirmedIncome: true,
      periodStartDate: "2026-07-13",
      periodEndDate: "2026-08-13",
      breakdown: {
        currentActualBalance: 40000,
        expectedRecurringIncome: 5000,
        recurringPayments: 12000,
        otherMandatoryPayments: 0,
        mandatoryPayments: 12000,
        essentialPlannedSpending: 29680,
        otherRequiredExpenses: 0,
        plannedFreeMoney: 3320,
        periodStartDate: "2026-07-13",
        periodEndDate: "2026-08-13",
      },
      note: null,
    },
  });

  const planned = view.overviewItems.find((item) => item.id === "planned-free-money");
  assert.equal(planned?.subtitle, "до 13 августа 2026");
  assert.equal(planned?.details?.[0]?.label, "Сейчас в кошельке");
  assert.equal(planned?.details?.[1]?.value, "+5 000 ₽");
  assert.equal(planned?.details?.[2]?.label, "Регулярные платежи");
});

test("planned free money copy explains recurring-income plan without using narrow card text", () => {
  const view = buildTodayScreenView({
    decision: makeDecision(),
    locale: "ru",
    transactionCount: 2,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-14",
    },
    balances: { all: 69071, me: 69071, partner: 0 },
    freeMoney: {
      status: "restricted",
      amount: 0,
      periodEndDate: "2026-07-31",
      breakdown: {
        currentActualBalance: 69071,
        recurringPayments: 0,
        otherMandatoryPayments: 53000,
        mandatoryPayments: 53000,
        essentialPlannedSpending: 16071,
        otherRequiredExpenses: 0,
        freeMoney: 0,
        periodEndDate: "2026-07-31",
      },
      note: null,
    },
    plannedFreeMoney: {
      status: "available",
      amount: 11592,
      expectedRecurringIncome: 24000,
      includesUnconfirmedIncome: true,
      periodStartDate: "2026-07-13",
      periodEndDate: "2026-07-31",
      breakdown: {
        currentActualBalance: 69071,
        expectedRecurringIncome: 24000,
        recurringPayments: 53000,
        otherMandatoryPayments: 0,
        mandatoryPayments: 53000,
        essentialPlannedSpending: 28479,
        otherRequiredExpenses: 0,
        plannedFreeMoney: 11592,
        periodStartDate: "2026-07-13",
        periodEndDate: "2026-07-31",
      },
      note: null,
    },
  });

  const planned = view.overviewItems.find((item) => item.id === "planned-free-money");
  assert.equal(view.overviewItems.find((item) => item.id === "allowed"), undefined);
  assert.match(planned?.value ?? "", /11[\s\u00A0]592 ₽/);
  assert.match(planned?.caption ?? "", /ожидаемые доходы придут по плану/i);
  assert.match(planned?.caption ?? "", /не подтверждено/i);
});

test("planned free money breakdown arithmetic stays explicit", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      allowed: {
        text: "Можно прожить день спокойно, но без новых трат.",
        hasRestPermission: true,
        status: "unknown",
        amount: null,
        horizonDate: null,
        reason: "Нельзя надёжно посчитать безопасную сумму.",
      },
    }),
    locale: "ru",
    transactionCount: 1,
    moneySetup: emptyMoneySetup(),
    balances: { all: 10000, me: 10000, partner: 0 },
    plannedFreeMoney: {
      status: "available",
      amount: 2500,
      expectedRecurringIncome: 5000,
      includesUnconfirmedIncome: true,
      periodStartDate: "2026-07-13",
      periodEndDate: "2026-07-31",
      breakdown: {
        currentActualBalance: 10000,
        expectedRecurringIncome: 5000,
        recurringPayments: 5000,
        otherMandatoryPayments: 3000,
        mandatoryPayments: 8000,
        essentialPlannedSpending: 4500,
        otherRequiredExpenses: 0,
        plannedFreeMoney: 2500,
        periodStartDate: "2026-07-13",
        periodEndDate: "2026-07-31",
      },
      note: null,
    },
  });

  const planned = view.overviewItems.find((item) => item.id === "planned-free-money");
  assert.deepEqual(
    planned?.details?.map((item) => item.label),
    [
      "Сейчас в кошельке",
      "Ожидаемые доходы",
      "Регулярные платежи",
      "Другие обязательные платежи",
      "Базовые расходы по лимитам",
      "Другие обязательные расходы",
      "Можно потратить",
    ],
  );
  assert.equal(planned?.details?.at(-1)?.value, "2 500 ₽");
});

test("main payment is not duplicated as equal secondary card", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "pay_today",
        title: "Оплатите аренду",
        text: "Оплатите аренду — 50 000 ₽ сегодня.",
        description: "Срок — сегодня.",
        reason: "На сегодня есть обязательный платёж.",
        amount: 50000,
        dueDate: "2026-07-12",
        relatedEntityId: "rent",
        priority: "high",
        command: { type: "confirm_payment", paymentId: "rent" },
      },
      todayPayments: [
        {
          id: "rent",
          title: "Аренда",
          amount: 50000,
          date: "2026-07-12",
        },
        {
          id: "internet",
          title: "Интернет",
          amount: 1200,
          date: "2026-07-12",
        },
      ],
    }),
    locale: "ru",
    transactionCount: 4,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    balances: { all: 90000, me: 90000, partner: 0 },
  });

  assert.equal(view.hiddenPrimaryPaymentId, "rent");
  assert.equal(view.payments?.items.length, 1);
  assert.equal(view.payments?.items[0]?.id, "internet");
});

test("other payments remain visible after primary payment is lifted to hero", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "pay_today",
        title: "Оплатите аренду",
        text: "Оплатите аренду — 50 000 ₽ сегодня.",
        description: "Срок — сегодня.",
        reason: "На сегодня есть обязательный платёж.",
        amount: 50000,
        dueDate: "2026-07-12",
        relatedEntityId: "rent",
        priority: "high",
        command: { type: "confirm_payment", paymentId: "rent" },
      },
      todayPayments: [
        { id: "rent", title: "Аренда", amount: 50000, date: "2026-07-12" },
        { id: "internet", title: "Интернет", amount: 1200, date: "2026-07-12" },
        { id: "music", title: "Подписка", amount: 499, date: "2026-07-12" },
      ],
    }),
    locale: "ru",
    transactionCount: 4,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    balances: { all: 90000, me: 90000, partner: 0 },
  });

  assert.deepEqual(
    view.payments?.items.map((item) => item.id),
    ["internet", "music"],
  );
});

test("calm state stays non-alarming and keeps quick add available", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      status: {
        key: "calm",
        title: "Всё спокойно",
        toneClassName: "border-emerald-500/20 bg-emerald-500/5",
      },
    }),
    locale: "ru",
    transactionCount: 2,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    balances: { all: 45000, me: 45000, partner: 0 },
  });

  assert.equal(view.hero.statusLabel, "Всё спокойно");
  assert.equal(view.showQuickAddHint, true);
});

test("reserve required keeps the reserve guidance in hero without duplicating a Today card", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "reserve_for_risk",
        title: "Сохраните резерв",
        text: "Сохраните минимум 18 000 ₽ до 20 июля.",
        description: "До 20 июля запас денег станет минимальным.",
        reason: "Это ближайшая точка, где запас денег становится минимальным.",
        amount: 18000,
        dueDate: "2026-07-20",
        relatedEntityId: "rent",
        priority: "medium",
        command: {
          type: "open_forecast",
          focusDate: "2026-07-20",
          reason: "reserve_required",
          eventId: "rent-2026-07-20",
        },
      },
      nextRisk: {
        kind: "payment",
        title: "ЖКХ",
        amount: 18000,
        date: "2026-07-20",
        daysAway: 8,
        label: "через 8 дней",
      },
    }),
    locale: "ru",
    transactionCount: 3,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    balances: { all: 50000, me: 50000, partner: 0 },
  });

  assert.equal(view.hero.title, "Лучше оставить");
  assert.equal(view.hero.amount, null);
  assert.doesNotMatch(view.hero.title, /Сохраните резерв/);
  const reserve = view.overviewItems.find((item) => item.id === "reserve");
  assert.equal(reserve, undefined);
  assert.equal(view.overviewItems.length <= 2, true);
});

test("today view no longer exposes avoid or peace index cards", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "reserve_for_risk",
        title: "Сохраните резерв",
        text: "Сохраните минимум 18 000 ₽ до 20 июля.",
        description: "До 20 июля запас денег станет минимальным.",
        reason: "Это ближайшая точка, где запас денег становится минимальным.",
        amount: 18000,
        dueDate: "2026-07-20",
        relatedEntityId: "rent",
        priority: "medium",
        command: {
          type: "open_forecast",
          focusDate: "2026-07-20",
          reason: "reserve_required",
          eventId: "rent-2026-07-20",
        },
      },
      avoid: {
        text: "Не тратить резерв, который нужен до ближайшего риска.",
        reason: "Иначе не хватит на аренду.",
      },
    }),
    locale: "ru",
    transactionCount: 3,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    balances: { all: 50000, me: 50000, partner: 0 },
  });

  assert.equal("avoid" in view, false);
  assert.equal("peaceIndex" in view, false);
});

test("future deficit says money may run short", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "cover_deficit",
        title: "Подготовьте резерв",
        text: "Найдите или высвободите 8 500 ₽ до 27 июля.",
        description: "27 июля возможен дефицит.",
        reason: "Это ближайший риск на прогнозной линии.",
        amount: 8500,
        dueDate: "2026-07-27",
        relatedEntityId: "rent",
        priority: "high",
        command: {
          type: "open_forecast",
          focusDate: "2026-07-27",
          reason: "future_deficit",
          eventId: "rent-2026-07-27",
        },
      },
    }),
    locale: "ru",
    transactionCount: 2,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-30",
    },
    balances: { all: 12000, me: 12000, partner: 0 },
  });

  assert.match(view.hero.title, /27\.07\.2026 денег может не хватить/);
  assert.match(view.hero.reason ?? "", /баланс уйдёт в минус/);
  assert.equal(view.hero.amount, null);
});

test("current deficit says money is missing right now", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "cover_deficit",
        title: "Закройте дефицит",
        text: "Нужно закрыть дефицит 8 500 ₽.",
        description: "Баланс уже ушёл в минус или делает это сегодня.",
        reason: "Пока дефицит не закрыт, остальные рекомендации вторичны.",
        amount: 8500,
        dueDate: "2026-07-12",
        relatedEntityId: null,
        priority: "critical",
        command: {
          type: "open_forecast",
          focusDate: "2026-07-12",
          reason: "current_deficit",
          eventId: null,
        },
      },
    }),
    locale: "ru",
    transactionCount: 2,
    moneySetup: emptyMoneySetup(),
    balances: { all: -500, me: -500, partner: 0 },
  });

  assert.equal(view.hero.title, "Сейчас денег не хватает");
  assert.match(view.hero.reason ?? "", /влияют на остаток/);
  assert.equal(view.hero.amount, null);
});

test("payment today uses a concrete payment name", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "pay_today",
        title: "Оплатите интернет",
        text: "Оплатите интернет — 1 200 ₽ сегодня.",
        description: "Срок — сегодня.",
        reason: "На сегодня есть обязательный платёж.",
        amount: 1200,
        dueDate: "2026-07-12",
        relatedEntityId: "internet",
        priority: "high",
        command: { type: "confirm_payment", paymentId: "internet" },
      },
    }),
    locale: "ru",
    transactionCount: 4,
    moneySetup: emptyMoneySetup(),
    balances: { all: 9000, me: 9000, partner: 0 },
  });

  assert.equal(view.hero.title, "Оплатите интернет");
  assert.match(view.hero.amount ?? "", /1[\s\u00A0]200 ₽/);
});

test("overdue payment keeps the concrete payment amount in hero", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "pay_overdue",
        title: "Оплатите аренду",
        text: "Аренда просрочена на 10 000 ₽.",
        description: "Платёж уже просрочен.",
        reason: "Этот платёж уже должен был быть оплачен.",
        amount: 10000,
        dueDate: "2026-07-10",
        relatedEntityId: "rent",
        priority: "critical",
        command: { type: "confirm_payment", paymentId: "rent" },
      },
    }),
    locale: "ru",
    transactionCount: 4,
    moneySetup: emptyMoneySetup(),
    balances: { all: 9000, me: 9000, partner: 0 },
  });

  assert.equal(view.hero.title, "Оплатите аренду");
  assert.match(view.hero.amount ?? "", /10[\s\u00A0]000 ₽/);
});

test("operations nav icon uses receipt text while other tabs stay unchanged", () => {
  const operations = APP_BOTTOM_NAV_TABS.find((tab) => tab.id === "operations");
  const today = APP_BOTTOM_NAV_TABS.find((tab) => tab.id === "today");
  const forecast = APP_BOTTOM_NAV_TABS.find((tab) => tab.id === "forecast");

  assert.equal(operations?.icon, ReceiptText);
  assert.equal(today?.icon, House);
  assert.equal(forecast?.icon, ChartColumn);
});

test("focused forecast view explains why the selected context is shown", () => {
  const view = buildFocusedForecastView(
    makeForecast({
      events: [
        {
          id: "salary-2026-07-27",
          title: "Зарплата",
          amount: 120000,
          date: "2026-07-27",
          balanceAfter: 111500,
          source: "income_source",
        },
        {
          id: "credit-2026-07-27",
          title: "Кредит",
          amount: -19000,
          date: "2026-07-27",
          balanceAfter: 92500,
          source: "debt_payment",
        },
        {
          id: "rent-2026-07-27",
          title: "Аренда",
          amount: -101000,
          date: "2026-07-27",
          balanceAfter: -8500,
          source: "recurring",
        },
      ],
    }),
    {
      date: "2026-07-27",
      source: "today_main_action",
      reason: "future_deficit",
      eventId: "rent-2026-07-27",
    },
    "ru",
    {
      date: "2026-07-27",
      kind: "deficit",
      title: "27 июля денег уже не хватит.",
      summary: "После 3 платежей баланс станет −8 500 ₽.",
      detail: null,
      eventId: "rent-2026-07-27",
      eventTitle: "Аренда",
      eventAmount: -101000,
      balanceAfter: -8500,
      requiredFloor: 0,
      eventCount: 3,
      totalDelta: 0,
    },
  );

  assert.equal(view.selectedDate, "2026-07-27");
  assert.equal(view.selectedEventId, "rent-2026-07-27");
  assert.match(view.contextTitle ?? "", /27 июля/);
  assert.match(view.contextSummary ?? "", /−8[\s\u00A0]500 ₽/);
});

test("focused forecast view keeps other events visible on the same day", () => {
  const forecast = makeForecast();
  const groupedEventCount = forecast.events.filter((event) => event.date === "2026-07-27").length;
  assert.equal(groupedEventCount, 3);
});

test("stale forecast event id falls back to the date", () => {
  const view = buildFocusedForecastView(
    makeForecast(),
    {
      date: "2026-07-27",
      source: "today_main_action",
      reason: "future_deficit",
      eventId: "gone-event",
    },
    "ru",
  );

  assert.equal(view.selectedDate, "2026-07-27");
  assert.equal(view.selectedEventId, null);
  assert.match(view.message ?? "", /денег по прогнозу уже может не хватить/);
});

test("missing focused date quietly falls back to the regular forecast view", () => {
  const view = buildFocusedForecastView(
    makeForecast(),
    {
      date: "2026-07-26",
      source: "today_main_action",
      reason: "future_deficit",
      eventId: "gone-event",
    },
    "ru",
  );

  assert.equal(view.selectedDate, null);
  assert.equal(view.selectedEventId, null);
  assert.equal(view.message, null);
  assert.equal(view.contextTitle, null);
});

test("Today no longer renders a separate safe-until explanation card", () => {
  const explanation = {
    date: "2026-08-03",
    kind: "reserve" as const,
    title: "Почему до 3 августа?",
    summary: "После платежа «Ипотека» на 40 000 ₽ останется 8 500 ₽.",
    detail: "Эти деньги уже нужны на базовые расходы.",
    eventId: "mortgage",
    eventTitle: "Ипотека",
    eventAmount: -40000,
    balanceAfter: 8500,
    requiredFloor: 8500,
    eventCount: 1,
    totalDelta: -40000,
  };
  const view = buildTodayScreenView({
    decision: makeDecision({
      safeUntil: {
        status: "constraint_found",
        title: "До 03.08.2026",
        note: "Расчёт по прогнозной линии.",
        isReady: true,
        needsSetup: false,
        rawStatus: "ready",
        safeToday: 0,
        nextIncomeDate: "2026-08-10",
        nextIncomeTitle: "Зарплата",
        nextIncomeAmount: 90000,
        horizonEndDate: "2026-08-10",
        horizonMonths: 3,
        confidence: "confirmed",
      },
      constraintExplanation: explanation,
    }),
    locale: "ru",
    transactionCount: 3,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-08-10",
    },
    balances: { all: 84994, me: 84994, partner: 0 },
  });

  const safeUntil = view.overviewItems.find((item) => item.id === "safe-until");
  assert.equal(safeUntil, undefined);

  const focused = buildFocusedForecastView(
    makeForecast({
      firstDeficitDate: null,
      nextIncomeDate: "2026-08-10",
      events: [
        {
          id: "mortgage",
          title: "Ипотека",
          amount: -40000,
          date: "2026-08-03",
          balanceAfter: 8500,
          source: "recurring",
        },
      ],
    }),
    {
      date: "2026-08-03",
      source: "today_main_action",
      reason: "reserve_required",
      eventId: "mortgage",
    },
    "ru",
    explanation,
  );

  assert.equal(focused.contextSummary, explanation.summary);
  assert.equal(focused.contextDetail, explanation.detail);
});

test("money setup progress is based on filled data", () => {
  const progress = buildMoneySetupProgress({
    locale: "ru",
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    categoryBudgets: [{ categoryId: "groceries", monthlyLimit: 30000 }],
    balances: { all: 15000, me: 15000, partner: 0 },
  });

  assert.equal(progress.completed, 3);
  assert.equal(progress.summary, "3 из 3 заполнено");
});

test("money setup progress no longer asks to mark recurring payments separately", () => {
  const progress = buildMoneySetupProgress({
    locale: "ru",
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    categoryBudgets: [{ categoryId: "groceries", monthlyLimit: 30000 }],
    balances: { all: 15000, me: 15000, partner: 0 },
  });

  assert.equal(progress.items.some((item) => item.label === "Обязательные платежи"), false);
});

test("essential-only missing data no longer asks to add required payments", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      mainAction: {
        type: "complete_required_expenses_setup",
        title: "Настройте базовые траты",
        text: "Отметьте базовые категории расходов и их лимиты.",
        description: "Иначе прогноз может показывать ложную уверенность.",
        reason: "Сейчас не хватает данных о базовых тратах периода.",
        priority: "medium",
        command: { type: "open_money_setup", scope: "essential_budgets" },
      },
    }),
    locale: "ru",
    transactionCount: 3,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
      hasNoRequiredFixedExpenses: true,
    },
    balances: { all: 15000, me: 15000, partner: 0 },
  });

  assert.equal(view.hero.title, "Настройте базовые траты");
  assert.equal(view.hero.ctaLabel, "Настроить плановые расходы");
  assert.match(view.hero.reason ?? "", /базовых тратах периода/i);
});

test("money setup dialog no longer renders required recurring payment checkboxes or essential category toggles", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/MoneySetupDialog.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /Обязательные регулярные платежи/);
  assert.doesNotMatch(source, /required recurring payments/i);
  assert.doesNotMatch(source, /У меня нет обязательных регулярных платежей/);
  assert.doesNotMatch(source, /Необходимые категории для жизни/);
  assert.doesNotMatch(source, /Essential life categories/);
});

test("money setup progress updates when another section is filled", () => {
  const before = buildMoneySetupProgress({
    locale: "ru",
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    categoryBudgets: [],
    balances: { all: 15000, me: 15000, partner: 0 },
  });
  const after = buildMoneySetupProgress({
    locale: "ru",
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    categoryBudgets: [{ categoryId: "groceries", monthlyLimit: 30000 }],
    balances: { all: 15000, me: 15000, partner: 0 },
  });

  assert.equal(before.completed, 2);
  assert.equal(after.completed, 3);
});

test("money setup progress ignores legacy essential ids without actual budgets", () => {
  const progress = buildMoneySetupProgress({
    locale: "ru",
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
      essentialCategoryIds: ["groceries"],
    },
    categoryBudgets: [],
    balances: { all: 15000, me: 15000, partner: 0 },
  });

  assert.equal(progress.completed, 2);
  assert.equal(progress.items.find((item) => item.id === "essential_categories")?.done, false);
});

test("MoneySetupDialog with initialSection=current_balance shows the current balance input immediately", () => {
  const view = buildMoneySetupBalanceSectionView({
    locale: "ru",
    initialSection: "current_balance",
    currentAvailableBalance: 15000,
    isCompleted: false,
  });

  assert.equal(view.title, "Текущий остаток");
  assert.equal(view.prompt, "Сколько денег сейчас доступно?");
  assert.equal(view.inputLabel, "Доступно сейчас");
  assert.equal(view.showInlineSaveButton, true);
});

test("TodayScreen no longer renders the top Today heading or secondary insight cards", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/TodayScreen.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /<TodaySecondaryInsights/);
  assert.doesNotMatch(source, /locale === "ru" \? "Сегодня" : "Today"/);
});

test("Settings tab now renders real app settings instead of services or business hubs", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/app/SettingsTab.tsx"),
    "utf8",
  );

  assert.match(source, /<SettingsDialogNav open onOpenChange=\{\(\) => \{\}\} \/>/);
  assert.doesNotMatch(source, /<MoreTab/);
  assert.doesNotMatch(source, /<BusinessTab/);
});

test("Today and recurring pending cards use the shared confirm and skip workflow", () => {
  const todaySource = fs.readFileSync(
    path.join(process.cwd(), "src/components/TodayScreen.tsx"),
    "utf8",
  );
  const recurringSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/PendingRecurringCard.tsx"),
    "utf8",
  );
  const i18nSource = fs.readFileSync(
    path.join(process.cwd(), "src/lib/i18n.ts"),
    "utf8",
  );

  assert.match(todaySource, /<ExpectedEventActionDialog/);
  assert.match(todaySource, /onSecondaryAction=/);
  assert.match(recurringSource, /<ExpectedEventActionDialog/);
  assert.match(recurringSource, /Не оплатил/);
  assert.doesNotMatch(i18nSource, /Если уже внесли вручную — «Пропустить»/);
  assert.match(i18nSource, /напомнить завтра/i);
});

test("setActualCash replaces the current balance instead of adding to it", () => {
  const previous = useStore.getState();

  useStore.setState({
    ...previous,
    categories: getDefaultCategories(),
    transactions: [
      {
        id: "expense-1",
        amount: 1485,
        type: "expense",
        categoryId: "groceries",
        currency: "RUB",
        note: "Продукты",
        date: "2026-07-12",
        owner: "me",
        goalId: null,
        goalAmount: null,
        recurringId: null,
        odometerKm: null,
        fuelLiters: null,
        vehicleId: null,
        transferPairId: null,
        businessTxId: null,
        confirmed: true,
      },
    ],
    cashOffsetMe: 0,
    cashOffsetPartner: 0,
  });

  useStore.getState().setActualCash("me", 68515);
  assert.equal(useStore.getState().cashOffsetMe, 70000);

  useStore.getState().setActualCash("me", 60000);
  assert.equal(useStore.getState().cashOffsetMe, 61485);

  useStore.setState(previous);
});

test("setActualCash allows saving zero without creating an income transaction", () => {
  const previous = useStore.getState();

  useStore.setState({
    ...previous,
    categories: getDefaultCategories(),
    transactions: [
      {
        id: "income-1",
        amount: 10000,
        type: "income",
        categoryId: "salary",
        currency: "RUB",
        note: "Зарплата",
        date: "2026-07-12",
        owner: "me",
        goalId: null,
        goalAmount: null,
        recurringId: null,
        odometerKm: null,
        fuelLiters: null,
        vehicleId: null,
        transferPairId: null,
        businessTxId: null,
        confirmed: true,
      },
    ],
    cashOffsetMe: 0,
    cashOffsetPartner: 0,
  });

  const beforeCount = useStore.getState().transactions.length;
  useStore.getState().setActualCash("me", 0);

  assert.equal(useStore.getState().cashOffsetMe, -10000);
  assert.equal(useStore.getState().transactions.length, beforeCount);

  useStore.setState(previous);
});

test("setActualCash ignores confirmed income that is dated in the future", () => {
  const previous = useStore.getState();

  useStore.setState({
    ...previous,
    categories: getDefaultCategories(),
    transactions: [
      {
        id: "future-income-1",
        amount: 120000,
        type: "income",
        categoryId: "salary",
        currency: "RUB",
        note: "Зарплата",
        date: "2026-07-20",
        owner: "me",
        goalId: null,
        goalAmount: null,
        recurringId: null,
        odometerKm: null,
        fuelLiters: null,
        vehicleId: null,
        transferPairId: null,
        businessTxId: null,
        confirmed: true,
      },
    ],
    cashOffsetMe: 0,
    cashOffsetPartner: 0,
  });

  useStore.getState().setActualCash("me", 5000);
  assert.equal(useStore.getState().cashOffsetMe, 5000);

  useStore.setState(previous);
});
