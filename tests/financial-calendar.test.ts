import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildForecastCalendarMonths } from "@/lib/forecast-calendar";
import {
  formatMoneyEventsCountLabel,
  resolveDisplayedEndBalance,
  resolveCalendarSelectionState,
  selectCalendarDay,
} from "@/components/app/ForecastCalendarView";
import { calculateBalanceAtDate } from "@/lib/decision-core/forecast-days";
import type { BalanceForecast } from "@/lib/decision-core/types";

function makeForecast(partial?: Partial<BalanceForecast>): BalanceForecast {
  return {
    startBalance: 50000,
    minBalance: 12000,
    minBalanceDate: "2026-07-14",
    firstDeficitDate: null,
    nextIncomeDate: "2026-07-14",
    horizonEndDate: "2026-10-13",
    horizonMonths: 3,
    events: [
      {
        id: "income-july",
        title: "Зарплата",
        amount: 24000,
        date: "2026-07-14",
        balanceAfter: 74000,
        source: "income_source",
      },
      {
        id: "rent-aug",
        title: "Аренда",
        amount: -10000,
        date: "2026-08-04",
        balanceAfter: 21000,
        source: "recurring",
      },
      {
        id: "shop-aug",
        title: "Плановые повседневные траты",
        amount: -1300,
        date: "2026-08-04",
        balanceAfter: 19700,
        source: "essential_budget",
      },
      {
        id: "income-sep",
        title: "Зарплата",
        amount: 24000,
        date: "2026-09-14",
        balanceAfter: 43700,
        source: "income_source",
      },
    ],
    days: [
      {
        date: "2026-07-14",
        events: [
          {
            id: "income-july",
            title: "Зарплата",
            amount: 24000,
            date: "2026-07-14",
            balanceAfter: 74000,
            source: "income_source",
          },
        ],
        incomeTotal: 24000,
        expenseTotal: 0,
        netChange: 24000,
        startBalance: 50000,
        endBalance: 74000,
      },
      {
        date: "2026-08-04",
        events: [
          {
            id: "rent-aug",
            title: "Аренда",
            amount: -10000,
            date: "2026-08-04",
            balanceAfter: 21000,
            source: "recurring",
          },
          {
            id: "shop-aug",
            title: "Плановые повседневные траты",
            amount: -1300,
            date: "2026-08-04",
            balanceAfter: 19700,
            source: "essential_budget",
          },
        ],
        incomeTotal: 0,
        expenseTotal: 11300,
        netChange: -11300,
        startBalance: 31000,
        endBalance: 19700,
      },
      {
        date: "2026-09-14",
        events: [
          {
            id: "income-sep",
            title: "Зарплата",
            amount: 24000,
            date: "2026-09-14",
            balanceAfter: 43700,
            source: "income_source",
          },
        ],
        incomeTotal: 24000,
        expenseTotal: 0,
        netChange: 24000,
        startBalance: 19700,
        endBalance: 43700,
      },
    ],
    ...partial,
  };
}

test("calendar months include forecast days and goal deadlines on their exact dates", () => {
  const months = buildForecastCalendarMonths({
    forecast: makeForecast(),
    startDate: "2026-07-13",
    locale: "ru",
    goals: [{ id: "goal-1", name: "Подушка", deadline: "2026-08-04" }],
  });

  assert.equal(months.length, 4);
  assert.equal(months[0]?.key, "2026-07");
  assert.equal(months[1]?.key, "2026-08");
  const august = months[1];
  const august4 = august?.days.find((day) => day.date === "2026-08-04");
  assert.ok(august4);
  assert.equal(august4?.expenseTotal, 11300);
  assert.equal(august4?.eventsCount, 2);
  assert.equal(august4?.goals.length, 1);
});

test("calendar keeps deficit markers on the day where end balance turns negative", () => {
  const months = buildForecastCalendarMonths({
    forecast: makeForecast({
      firstDeficitDate: "2026-08-04",
      days: [
        {
          date: "2026-08-04",
          events: [
            {
              id: "rent-aug",
              title: "Аренда",
              amount: -10000,
              date: "2026-08-04",
              balanceAfter: -2500,
              source: "recurring",
            },
          ],
          incomeTotal: 0,
          expenseTotal: 10000,
          netChange: -10000,
          startBalance: 7500,
          endBalance: -2500,
        },
      ],
      events: [
        {
          id: "rent-aug",
          title: "Аренда",
          amount: -10000,
          date: "2026-08-04",
          balanceAfter: -2500,
          source: "recurring",
        },
      ],
    }),
    startDate: "2026-07-13",
    locale: "ru",
  });

  const august = months.find((month) => month.key === "2026-08");
  const august4 = august?.days.find((day) => day.date === "2026-08-04");
  assert.equal(august4?.isDeficit, true);
});

test("calendar keeps end-of-day balance continuous from the previous day", () => {
  const forecast: BalanceForecast = {
    startBalance: 10000,
    minBalance: 8500,
    minBalanceDate: "2026-07-31",
    firstDeficitDate: null,
    nextIncomeDate: null,
    horizonEndDate: "2026-07-31",
    horizonMonths: 1,
    events: [
      {
        id: "expense-1",
        title: "Первый расход",
        amount: -1000,
        date: "2026-07-30",
        balanceAfter: 9000,
        source: "confirmed_transaction",
      },
      {
        id: "expense-2",
        title: "Второй расход",
        amount: -500,
        date: "2026-07-31",
        balanceAfter: 8500,
        source: "confirmed_transaction",
      },
    ],
  };

  assert.equal(calculateBalanceAtDate(forecast, "2026-07-30"), 9000);
  assert.equal(calculateBalanceAtDate(forecast, "2026-07-31"), 8500);
  assert.equal(
    resolveDisplayedEndBalance({
      date: "2026-07-31",
      forecast,
      forecastDay: null,
    }),
    8500,
  );
});

test("forecast tab exposes a line and calendar switch without adding a new bottom tab", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/app/ForecastTab.tsx"),
    "utf8",
  );

  assert.match(source, /viewMode === "line"/);
  assert.match(source, /viewMode === "calendar"/);
  assert.match(source, /Линия/);
  assert.match(source, /Календарь/);
  assert.match(source, /Изменить план/);
  assert.doesNotMatch(source, /id: "calendar"/);
});

test("calendar view uses inline accordion details instead of a detached details block", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/app/ForecastCalendarView.tsx"),
    "utf8",
  );

  assert.match(source, /Календарь денег/);
  assert.match(source, /Выберите день, чтобы посмотреть движение денег/);
  assert.match(source, /selectedDate === day\.date/);
  assert.match(source, /onSelectedDateChange\(selectCalendarDay\(selectedDate, day\.date\)\)/);
  assert.match(source, /calculateBalanceAtDate/);
  assert.match(source, /formatHumanDateLong\(day\.date, locale\)/);
  assert.match(source, /formatWeekdayShort\(day.date, locale\)/);
  assert.match(source, /aria-hidden="true"/);
  assert.match(source, /pointer-events-none h-4 w-4 text-muted-foreground transition-transform/);
  assert.match(source, /В конце дня/);
  assert.match(source, /🟡/);
  assert.doesNotMatch(source, /Изменить план/);
  assert.doesNotMatch(source, /Что произойдёт с деньгами в этот день/);
  assert.doesNotMatch(source, /periodFreeMoney\.amount/);
});

test("calendar day selection keeps the exact tapped ISO date", () => {
  assert.equal(selectCalendarDay("2026-07-15", "2026-07-16"), "2026-07-16");
  assert.equal(selectCalendarDay(null, "2026-07-16"), "2026-07-16");
  assert.equal(selectCalendarDay("2026-07-16", "2026-07-16"), null);
});

test("calendar formats Russian money-event counts with the right ending", () => {
  assert.equal(formatMoneyEventsCountLabel(1, "ru"), "1 движение по деньгам");
  assert.equal(formatMoneyEventsCountLabel(2, "ru"), "2 движения по деньгам");
  assert.equal(formatMoneyEventsCountLabel(5, "ru"), "5 движений по деньгам");
  assert.equal(formatMoneyEventsCountLabel(21, "ru"), "21 движение по деньгам");
  assert.equal(formatMoneyEventsCountLabel(24, "ru"), "24 движения по деньгам");
  assert.equal(formatMoneyEventsCountLabel(11, "ru"), "11 движений по деньгам");
});

test("calendar keeps the user-selected date after data rerender", () => {
  const monthDays = [
    { date: "2026-07-15", isCurrentMonth: true, hasEvents: true, goals: [] },
    { date: "2026-07-16", isCurrentMonth: true, hasEvents: true, goals: [] },
  ];

  assert.equal(
    resolveCalendarSelectionState({
      currentSelectedDate: null,
      monthDays,
    }),
    null,
  );

  assert.equal(
    resolveCalendarSelectionState({
      currentSelectedDate: "2026-07-16",
      monthDays,
    }),
    "2026-07-16",
  );
});
