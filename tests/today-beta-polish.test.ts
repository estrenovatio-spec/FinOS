import assert from "node:assert/strict";
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
      title: "До 25 июля",
      note: "Расчёт по прогнозной линии.",
      isReady: true,
      needsSetup: false,
      rawStatus: "ready",
      safeToday: 3500,
      nextIncomeDate: "2026-07-25",
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
  assert.equal(view.peaceIndex, null);
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
  assert.match(view.hero.due ?? "", /25 июля/);
  assert.equal(view.hero.title, "Сегодня всё спокойно");
});

test("hero and safe-until overview use the same canonical date", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      safeUntil: {
        title: "До 3 августа",
        note: "Расчёт по прогнозной линии.",
        isReady: true,
        needsSetup: false,
        rawStatus: "ready",
        safeToday: 3500,
        nextIncomeDate: "2026-08-10",
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
  assert.equal(safeUntil?.value, "До 3 августа");
  assert.equal(view.hero.due, "Денег хватает до 3 августа");
  assert.doesNotMatch(view.hero.due ?? "", /25 июля/);
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

test("allowed available shows amount instead of prose", () => {
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

  const allowed = view.overviewItems.find((item) => item.id === "allowed");
  assert.equal(allowed?.label, "Можно потратить сегодня");
  assert.match(allowed?.value ?? "", /3[\s\u00A0]500 ₽/);
});

test("allowed restricted does not show false amount", () => {
  const view = buildTodayScreenView({
    decision: makeDecision({
      allowed: {
        text: "Сегодня лучше ограничиться обязательным.",
        hasRestPermission: false,
        status: "restricted",
        amount: 0,
        horizonDate: "2026-07-25",
        reason: "Необязательные траты нарушат обязательные платежи.",
      },
    }),
    locale: "ru",
    transactionCount: 3,
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    balances: { all: 15000, me: 15000, partner: 0 },
  });

  const allowed = view.overviewItems.find((item) => item.id === "allowed");
  assert.equal(allowed?.label, "Сегодня лучше не тратить лишнее");
  assert.equal(allowed?.value, "Свободные покупки лучше отложить");
});

test("allowed unknown shows uncertainty instead of zero", () => {
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
  });

  const allowed = view.overviewItems.find((item) => item.id === "allowed");
  assert.equal(allowed?.value, "пока неизвестно");
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

test("reserve required uses human copy and keeps amounts separate", () => {
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
  assert.doesNotMatch(view.hero.title, /Сохраните резерв/);
  const reserve = view.overviewItems.find((item) => item.id === "reserve");
  assert.match(reserve?.label ?? "", /Лучше оставить до 20 июля/);
  assert.match(reserve?.value ?? "", /18[\s\u00A0]000 ₽/);
  assert.notEqual(
    view.overviewItems.find((item) => item.id === "current-balance")?.label,
    reserve?.label,
  );
});

test("avoid is suppressed when it only repeats reserve wording", () => {
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

  assert.equal(view.avoid, null);
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

  assert.match(view.hero.title, /27 июля денег может не хватить/);
  assert.match(view.hero.reason ?? "", /баланс уйдёт в минус/);
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
  assert.match(view.message ?? "", /дата, на которой прогноз уходит в минус/);
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

test("Today safe-until card uses the same constraint explanation source", () => {
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
        title: "До 3 августа",
        note: "Расчёт по прогнозной линии.",
        isReady: true,
        needsSetup: false,
        rawStatus: "ready",
        safeToday: 0,
        nextIncomeDate: "2026-08-10",
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
  assert.equal(
    safeUntil?.caption,
    "После платежа «Ипотека» на 40 000 ₽ останется 8 500 ₽. Эти деньги уже нужны на базовые расходы.",
  );

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
      requiredRecurringIds: ["rent"],
      essentialCategoryIds: ["groceries"],
    },
    balances: { all: 15000, me: 15000, partner: 0 },
  });

  assert.equal(progress.completed, 4);
  assert.equal(progress.summary, "4 из 4 заполнено");
});

test("optional recurring absence can still count as completed setup", () => {
  const progress = buildMoneySetupProgress({
    locale: "ru",
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
      hasNoRequiredFixedExpenses: true,
      essentialCategoryIds: ["groceries"],
    },
    balances: { all: 15000, me: 15000, partner: 0 },
  });

  const requiredExpenses = progress.items.find((item) => item.id === "required_expenses");
  assert.equal(requiredExpenses?.done, true);
});

test("money setup progress updates when another section is filled", () => {
  const before = buildMoneySetupProgress({
    locale: "ru",
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
    },
    balances: { all: 15000, me: 15000, partner: 0 },
  });
  const after = buildMoneySetupProgress({
    locale: "ru",
    moneySetup: {
      ...emptyMoneySetup(),
      nextIncomeDate: "2026-07-25",
      essentialCategoryIds: ["groceries"],
    },
    balances: { all: 15000, me: 15000, partner: 0 },
  });

  assert.equal(before.completed, 2);
  assert.equal(after.completed, 3);
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
