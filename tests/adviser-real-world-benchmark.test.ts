import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvisorContext } from "@/lib/advisor-context";
import { classifyAdvisorQuestion } from "@/lib/ai/question-classifier";
import { evaluateAdvisorAnswer } from "@/lib/ai/advisor-evaluation";
import { getDefaultCategories } from "@/lib/categories";
import { decisionCoreSnapshot, type DecisionCoreState } from "@/lib/decision-core";
import { calculatePlannedFreeMoneyUntilPeriodEnd } from "@/lib/free-money";
import { emptyMoneySetup } from "@/lib/money-setup";
import type { SavingsGoal } from "@/types/planning";

function makeState(overrides: Partial<DecisionCoreState> = {}): DecisionCoreState {
  return {
    locale: "ru",
    today: "2026-07-18",
    forecastHorizonMonths: 3,
    categories: getDefaultCategories(),
    transactions: [],
    householdFilter: "me",
    recurringTransactions: [
      {
        id: "salary-main",
        amount: 43000,
        type: "income",
        categoryId: "salary",
        note: "Зарплата",
        skippedDates: [],
        owner: "me",
        frequency: "monthly",
        intervalMonths: 1,
        dayOfMonth: 20,
        nextRunDate: "2026-07-20",
        endDate: null,
        enabled: true,
      },
      {
        id: "rent-main",
        amount: 53000,
        type: "expense",
        categoryId: "rent",
        note: "Аренда",
        skippedDates: [],
        owner: "me",
        frequency: "monthly",
        intervalMonths: 1,
        dayOfMonth: 20,
        nextRunDate: "2026-07-20",
        endDate: null,
        enabled: true,
      },
    ],
    debts: [],
    moneySetup: {
      ...emptyMoneySetup(),
      incomeSources: [
        {
          id: "salary-main",
          label: "Зарплата",
          expectedDate: "2026-07-20",
          expectedAmount: 43000,
          kind: "salary",
          recurrence: "monthly",
          intervalMonths: 1,
          dayOfMonth: 20,
          endDate: null,
          isPrimary: true,
        },
      ],
      essentialCategoryIds: ["groceries", "transport"],
    },
    categoryBudgets: [
      { categoryId: "groceries", monthlyLimit: 30000 },
      { categoryId: "transport", monthlyLimit: 10000 },
    ],
    budgetMonthStartDay: 1,
    balances: { all: 80925, me: 80925, partner: 0 },
    ...overrides,
  };
}

function withContext(
  stateOverrides: Partial<DecisionCoreState> = {},
  goals: SavingsGoal[] = [],
) {
  const state = makeState(stateOverrides);
  const snapshot = decisionCoreSnapshot(state);
  const plannedFreeMoney = calculatePlannedFreeMoneyUntilPeriodEnd(state, snapshot);
  const adviserContext = buildAdvisorContext({
    locale: state.locale,
    today: state.today,
    currentBalance: state.balances.me,
    decision: snapshot,
    recurringTransactions: state.recurringTransactions,
    goals,
    debts: state.debts,
    categoryBudgets: state.categoryBudgets,
    plannedFreeMoney,
    transactions: state.transactions,
    categories: state.categories,
    budgetMonthStartDay: state.budgetMonthStartDay,
    expectedEventReminderStates: state.moneySetup.expectedEventReminderStates,
  });

  return {
    state,
    snapshot,
    plannedFreeMoney,
    financialContext: adviserContext.financialContext,
  };
}

function formatRub(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(amount))} ₽`;
}

type BenchmarkCase = {
  name: string;
  question: string;
  expectedType:
    | "cashflow_delay"
    | "purchase_decision"
    | "expense_control"
    | "debt_strategy"
    | "goal_planning";
  buildAnswer: () => {
    answer: string;
    financialContext: ReturnType<typeof withContext>["financialContext"];
    purchaseAmountRub?: number | null;
  };
};

const baseCase = withContext();
const debtCase = withContext({
  debts: [
    {
      id: "housing-water",
      name: "ЖКХ вода",
      owner: "me",
      balance: 21000,
      minPayment: 5000,
      ratePct: 0,
      nextPaymentDate: "2026-07-20",
      strategy: "avalanche",
      priority: "high",
    },
    {
      id: "housing-dmitrov",
      name: "ЖКХ Дмитров",
      owner: "me",
      balance: 86000,
      minPayment: 18000,
      ratePct: 0,
      nextPaymentDate: "2026-07-20",
      strategy: "avalanche",
      priority: "high",
    },
  ],
});
const homeGoalCase = withContext(
  {},
  [
    {
      id: "goal-home",
      name: "Дом",
      targetAmount: 20_000_000,
      savedAmount: 0,
      deadline: "2031-07-18",
      monthlyContribution: null,
      kind: "custom",
      emergencyMonths: null,
    },
  ],
);

const benchmarkCases: BenchmarkCase[] = [
  {
    name: "salary delay 1",
    question: "У меня зарплата задержится, я переживаю. Что делать?",
    expectedType: "cashflow_delay",
    buildAnswer: () => ({
      financialContext: baseCase.financialContext,
      answer: [
        `Сейчас у вас в кошельке ${formatRub(baseCase.financialContext.balances.currentBalance)}, а до 20.07.2026 ещё ожидается зарплата ${formatRub(baseCase.financialContext.incomes.expectedTotal)}.`,
        `Главное давление даёт аренда ${formatRub(baseCase.financialContext.expenses.recurringTotal)}, поэтому риск начинается около 20.07.2026, а не прямо сегодня.`,
        `Сначала оставьте резерв до 20.07.2026, потом заморозьте необязательные траты по лимитам, и в день зарплаты ещё раз сверьте прогноз перед любыми новыми решениями.`,
      ].join(" "),
    }),
  },
  {
    name: "salary delay 2",
    question: "Если зарплату опять сдвинут, как мне не провалиться?",
    expectedType: "cashflow_delay",
    buildAnswer: () => ({
      financialContext: baseCase.financialContext,
      answer: [
        `По фактам у вас сейчас ${formatRub(baseCase.financialContext.balances.currentBalance)} и ожидаемый доход ${formatRub(baseCase.financialContext.incomes.expectedTotal)} на 20.07.2026.`,
        `Проблема не в отсутствии дохода, а в том, что аренда ${formatRub(baseCase.financialContext.expenses.recurringTotal)} создаёт риск для прогноза раньше, чем появится запас сверх плана.`,
        `Сначала удержите остаток до 20.07.2026, затем перенесите второстепенные расходы и только после этого проверяйте, нужен ли новый сценарий.`,
      ].join(" "),
    }),
  },
  {
    name: "salary delay 3",
    question: "Зарплата может прийти позже. Как пережить это спокойно?",
    expectedType: "cashflow_delay",
    buildAnswer: () => ({
      financialContext: baseCase.financialContext,
      answer: [
        `Сейчас тревогу можно снизить фактами: в кошельке ${formatRub(baseCase.financialContext.balances.currentBalance)}, ожидаемая зарплата — ${formatRub(baseCase.financialContext.incomes.expectedTotal)}, ближайший крупный платёж — аренда ${formatRub(baseCase.financialContext.expenses.recurringTotal)}.`,
        `Риск привязан к дате 20.07.2026, потому что именно тогда сходятся зарплата и аренда.`,
        `Сначала не трогайте резерв до 20.07.2026, потом сократите необязательные траты по лимитам и вечером 20.07.2026 обновите прогноз.`,
      ].join(" "),
    }),
  },
  {
    name: "salary delay 4",
    question: "Что мне делать, если зарплата запоздает?",
    expectedType: "cashflow_delay",
    buildAnswer: () => ({
      financialContext: baseCase.financialContext,
      answer: [
        `Сейчас у вас есть ${formatRub(baseCase.financialContext.balances.currentBalance)}, а ожидаемый доход ${formatRub(baseCase.financialContext.incomes.expectedTotal)} ещё не пришёл.`,
        `Если зарплата запоздает, узкая точка будет 20.07.2026 из-за аренды ${formatRub(baseCase.financialContext.expenses.recurringTotal)}.`,
        `Сначала сохраните резерв до этой даты, затем отложите необязательные траты и проверьте прогноз сразу после поступления зарплаты.`,
      ].join(" "),
    }),
  },
  {
    name: "car purchase 1",
    question: "Хочу купить машину. Можно или рано?",
    expectedType: "purchase_decision",
    buildAnswer: () => {
      const purchaseAmountRub = 1_500_000;
      const gap = purchaseAmountRub - baseCase.financialContext.balances.plannedFreeMoney;
      return {
        financialContext: baseCase.financialContext,
        purchaseAmountRub,
        answer: [
          `Сейчас в кошельке ${formatRub(baseCase.financialContext.balances.currentBalance)}, а по плану свободно ${formatRub(baseCase.financialContext.balances.plannedFreeMoney)}.`,
          `Если машина стоит ${formatRub(purchaseAmountRub)}, то разрыв сейчас ${formatRub(gap)} — значит покупать рано.`,
          `Сначала определите посильный ежемесячный взнос, потом проверьте сценарий без удара по аренде ${formatRub(baseCase.financialContext.expenses.recurringTotal)}, и только после этого стройте план покупки.`,
        ].join(" "),
      };
    },
  },
  {
    name: "car purchase 2",
    question: "Машину уже потяну или пока нет?",
    expectedType: "purchase_decision",
    buildAnswer: () => {
      const purchaseAmountRub = 1_500_000;
      const gap = purchaseAmountRub - baseCase.financialContext.balances.plannedFreeMoney;
      return {
        financialContext: baseCase.financialContext,
        purchaseAmountRub,
        answer: [
          `По цифрам пока нет: свободных денег сейчас ${formatRub(baseCase.financialContext.balances.plannedFreeMoney)}, а цена машины ${formatRub(purchaseAmountRub)}.`,
          `Разрыв остаётся ${formatRub(gap)}, и он важнее желания купить сейчас.`,
          `Сначала посчитайте, сколько реально можно откладывать после аренды ${formatRub(baseCase.financialContext.expenses.recurringTotal)}, затем проверьте срок накопления и только потом возвращайтесь к покупке.`,
        ].join(" "),
      };
    },
  },
  {
    name: "car purchase 3",
    question: "Если брать авто сейчас, не сломаю бюджет?",
    expectedType: "purchase_decision",
    buildAnswer: () => {
      const purchaseAmountRub = 1_500_000;
      const gap = purchaseAmountRub - baseCase.financialContext.balances.plannedFreeMoney;
      return {
        financialContext: baseCase.financialContext,
        purchaseAmountRub,
        answer: [
          `Сейчас бюджет этого не держит: в кошельке ${formatRub(baseCase.financialContext.balances.currentBalance)}, свободно по плану ${formatRub(baseCase.financialContext.balances.plannedFreeMoney)}, а покупка — ${formatRub(purchaseAmountRub)}.`,
          `Разрыв ${formatRub(gap)} показывает, что без отдельного плана покупка сломает месяц.`,
          `Сначала сохраните текущий поток, затем проверьте сценарий накопления, и только после этого решайте, когда возвращаться к покупке машины.`,
        ].join(" "),
      };
    },
  },
  {
    name: "car purchase 4",
    question: "На машину я уже созрел, но финансово это рано?",
    expectedType: "purchase_decision",
    buildAnswer: () => {
      const purchaseAmountRub = 1_500_000;
      const gap = purchaseAmountRub - baseCase.financialContext.balances.plannedFreeMoney;
      return {
        financialContext: baseCase.financialContext,
        purchaseAmountRub,
        answer: [
          `Финансово пока рано: по плану свободно ${formatRub(baseCase.financialContext.balances.plannedFreeMoney)}, а стоимость машины ${formatRub(purchaseAmountRub)}.`,
          `Разрыв ${formatRub(gap)} возникает до учёта новых рисков, потому что аренда ${formatRub(baseCase.financialContext.expenses.recurringTotal)} уже держит обязательную нагрузку.`,
          `Сначала задайте цель по сумме и сроку, потом проверьте ежемесячный темп накопления и только после этого рассматривайте покупку.`,
        ].join(" "),
      };
    },
  },
  {
    name: "no money 1",
    question: "Почему денег опять нет?",
    expectedType: "expense_control",
    buildAnswer: () => ({
      financialContext: baseCase.financialContext,
      answer: [
        `Проблема не в том, что доходов нет: до 20.07.2026 ещё ожидается ${formatRub(baseCase.financialContext.incomes.expectedTotal)}.`,
        `Основное давление сейчас создают аренда ${formatRub(baseCase.financialContext.expenses.recurringTotal)} и расходы по лимитам ${formatRub(baseCase.financialContext.expenses.plannedBudgetsTotal)}, поэтому свободно остаётся ${formatRub(baseCase.financialContext.balances.plannedFreeMoney)}.`,
        `Сначала проверьте траты до 20.07.2026, потом сравните их с лимитами и отдельно решите, что можно сдвинуть без риска.`,
      ].join(" "),
    }),
  },
  {
    name: "no money 2",
    question: "Куда у меня всё снова утекает?",
    expectedType: "expense_control",
    buildAnswer: () => ({
      financialContext: baseCase.financialContext,
      answer: [
        `Деньги утекают не в одну точку, а в обязательства: аренда ${formatRub(baseCase.financialContext.expenses.recurringTotal)} и лимиты на ${formatRub(baseCase.financialContext.expenses.plannedBudgetsTotal)} съедают поток до конца периода.`,
        `При этом ожидаемый доход ${formatRub(baseCase.financialContext.incomes.expectedTotal)} ещё только должен прийти 20.07.2026.`,
        `Сначала посмотрите, какие траты идут до 20.07.2026, затем сверяйте их с лимитами, и после этого сокращайте только необязательные статьи.`,
      ].join(" "),
    }),
  },
  {
    name: "no money 3",
    question: "Почему к концу месяца опять пусто?",
    expectedType: "expense_control",
    buildAnswer: () => ({
      financialContext: baseCase.financialContext,
      answer: [
        `К концу месяца пусто, потому что регулярный платёж аренды ${formatRub(baseCase.financialContext.expenses.recurringTotal)} и лимиты ${formatRub(baseCase.financialContext.expenses.plannedBudgetsTotal)} почти целиком съедают поток.`,
        `Доход ${formatRub(baseCase.financialContext.incomes.expectedTotal)} у вас есть, но он ожидается только 20.07.2026.`,
        `Сначала удержите резерв до 20.07.2026, потом сократите необязательные траты, и отдельно пересмотрите лимиты, которые быстрее всего съедают остаток.`,
      ].join(" "),
    }),
  },
  {
    name: "no money 4",
    question: "Почему у меня постоянно не остаётся денег?",
    expectedType: "expense_control",
    buildAnswer: () => ({
      financialContext: baseCase.financialContext,
      answer: [
        `Основная причина в обязательной нагрузке: аренда ${formatRub(baseCase.financialContext.expenses.recurringTotal)} плюс лимиты ${formatRub(baseCase.financialContext.expenses.plannedBudgetsTotal)}.`,
        `Доход ${formatRub(baseCase.financialContext.incomes.expectedTotal)} ожидается 20.07.2026, поэтому до этой даты запас особенно важен.`,
        `Сначала разберите траты до 20.07.2026, затем уберите необязательные списания и после этого проверьте, какие лимиты реально можно снизить.`,
      ].join(" "),
    }),
  },
  {
    name: "debt strategy 1",
    question: "Мне надо закрыть долги. С чего начать?",
    expectedType: "debt_strategy",
    buildAnswer: () => ({
      financialContext: debtCase.financialContext,
      answer: [
        `Сначала держите приоритет на ЖКХ Дмитров: остаток ${formatRub(86000)} и ближайший платёж ${formatRub(18000)} — это самый тяжёлый долг в вашем плане.`,
        `ЖКХ вода тоже нельзя бросать, потому что там остаток ${formatRub(21000)} и обязательный платёж ${formatRub(5000)}.`,
        `Порядок такой: сначала внести ${formatRub(18000)} по ЖКХ Дмитров, затем ${formatRub(5000)} по ЖКХ вода, и после этого весь свободный остаток направлять в один долг до закрытия.`,
      ].join(" "),
    }),
  },
  {
    name: "debt strategy 2",
    question: "С каких долгов лучше выходить первым делом?",
    expectedType: "debt_strategy",
    buildAnswer: () => ({
      financialContext: debtCase.financialContext,
      answer: [
        `Первым делом я бы держал приоритет на ЖКХ Дмитров: там платёж ${formatRub(18000)} и самый тяжёлый остаток ${formatRub(86000)}.`,
        `ЖКХ вода с платёжом ${formatRub(5000)} остаётся вторым, потому что его тоже нужно удерживать без просрочки.`,
        `Сначала закройте обязательный платёж по ЖКХ Дмитров, затем платёж по ЖКХ вода и только потом направляйте свободный остаток в один выбранный долг.`,
      ].join(" "),
    }),
  },
  {
    name: "debt strategy 3",
    question: "Как мне разобраться с долгами по уму?",
    expectedType: "debt_strategy",
    buildAnswer: () => ({
      financialContext: debtCase.financialContext,
      answer: [
        `По уму здесь важен порядок: ЖКХ Дмитров с остатком ${formatRub(86000)} и платёжом ${formatRub(18000)} сильнее всего давит на план.`,
        `ЖКХ вода с остатком ${formatRub(21000)} и платёжом ${formatRub(5000)} держите вторым, чтобы не накапливать новый хвост.`,
        `Сначала удерживайте оба минимальных платежа, затем любой свободный остаток направляйте только в один приоритетный долг до полного закрытия.`,
      ].join(" "),
    }),
  },
  {
    name: "debt strategy 4",
    question: "Что закрывать раньше: ипотеку или ЖКХ долг?",
    expectedType: "debt_strategy",
    buildAnswer: () => ({
      financialContext: debtCase.financialContext,
      answer: [
        `Раньше закрывайте то, что сильнее давит на месяц: сейчас это ЖКХ Дмитров с платежом ${formatRub(18000)} и остатком ${formatRub(86000)}.`,
        `ЖКХ вода с ${formatRub(5000)} оставляйте вторым приоритетом, чтобы не допустить новой просрочки.`,
        `Сначала внесите крупный обязательный платёж, затем маленький платёж по второму долгу, и только после этого ускоряйте досрочное закрытие одного выбранного остатка.`,
      ].join(" "),
    }),
  },
  {
    name: "home goal 1",
    question: "Хочу дом через 5 лет. Реально?",
    expectedType: "goal_planning",
    buildAnswer: () => ({
      financialContext: homeGoalCase.financialContext,
      answer: [
        `Цель — дом ${formatRub(20_000_000)}, срок уже понятен: 5 лет, то есть примерно 60 месяцев.`,
        `Чтобы дойти до этой цели с нуля, нужен темп около ${formatRub(Math.round(20_000_000 / 60))} в месяц, а сейчас по плану свободно ${formatRub(homeGoalCase.financialContext.balances.plannedFreeMoney)}.`,
        `Сначала проверьте, какой ежемесячный взнос реально держать, потом пересчитайте срок, и после этого стройте отдельный план дома.`,
      ].join(" "),
    }),
  },
  {
    name: "home goal 2",
    question: "Смогу ли я дойти до дома за пять лет?",
    expectedType: "goal_planning",
    buildAnswer: () => ({
      financialContext: homeGoalCase.financialContext,
      answer: [
        `Если цель — дом ${formatRub(20_000_000)} и срок 5 лет, вам нужен поток около ${formatRub(Math.round(20_000_000 / 60))} в месяц.`,
        `Сейчас по вашему плану свободно ${formatRub(homeGoalCase.financialContext.balances.plannedFreeMoney)}, поэтому в текущем режиме цель за этот срок нереальна.`,
        `Сначала определите реальный ежемесячный взнос, затем посмотрите новый срок и после этого решайте, как перестраивать план.`,
      ].join(" "),
    }),
  },
  {
    name: "home goal 3",
    question: "Дом через 5 лет для меня вообще достижим?",
    expectedType: "goal_planning",
    buildAnswer: () => ({
      financialContext: homeGoalCase.financialContext,
      answer: [
        `По цифрам цель понятна: дом ${formatRub(20_000_000)}, срок — 5 лет.`,
        `Для такого срока нужен темп около ${formatRub(Math.round(20_000_000 / 60))} в месяц, а свободный остаток по плану сейчас ${formatRub(homeGoalCase.financialContext.balances.plannedFreeMoney)}.`,
        `Сначала зафиксируйте посильный взнос, потом проверьте реальный срок и только после этого стройте план покупки дома.`,
      ].join(" "),
    }),
  },
  {
    name: "home goal 4",
    question: "Если хочу дом за 5 лет, какой нужен темп?",
    expectedType: "goal_planning",
    buildAnswer: () => ({
      financialContext: homeGoalCase.financialContext,
      answer: [
        `Для дома ${formatRub(20_000_000)} при сроке 5 лет нужен темп около ${formatRub(Math.round(20_000_000 / 60))} в месяц.`,
        `Сейчас свободно по плану ${formatRub(homeGoalCase.financialContext.balances.plannedFreeMoney)}, поэтому до такого темпа очень большой разрыв.`,
        `Сначала определите реальный ежемесячный взнос, затем пересчитайте срок и после этого решайте, как приближать цель без слома текущего бюджета.`,
      ].join(" "),
    }),
  },
];

test("real-world adviser benchmark keeps strong quality on natural user phrasing", () => {
  assert.equal(benchmarkCases.length, 20);

  for (const benchmark of benchmarkCases) {
    const classification = classifyAdvisorQuestion(benchmark.question, "ru");
    assert.equal(
      classification.type,
      benchmark.expectedType,
      `Classifier mismatch for ${benchmark.name}: ${benchmark.question}`,
    );

    const { answer, financialContext, purchaseAmountRub } = benchmark.buildAnswer();
    const result = evaluateAdvisorAnswer({
      question: benchmark.question,
      questionType: classification.type,
      answer,
      financialContext,
      purchaseAmountRub,
    });

    assert.equal(result.ok, true, `Answer failed evaluation for ${benchmark.name}`);
    assert.ok(
      result.score.accuracy >= 85,
      `Accuracy too low for ${benchmark.name}: ${result.score.accuracy}`,
    );
    assert.ok(
      result.score.safety >= 85,
      `Safety too low for ${benchmark.name}: ${result.score.safety}`,
    );
    assert.ok(
      result.score.actionability >= 85,
      `Actionability too low for ${benchmark.name}: ${result.score.actionability}`,
    );
  }
});
