import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveFutureOneTimeTransactionGroup,
  resolveFutureRecurringOperationGroup,
  splitPlannedFutureOperationsByMonth,
} from "@/lib/planning/future-operation-groups";

const planningPanelSource = readFileSync("src/components/PlanningPanel.tsx", "utf8");

test("future once stays only in planned", () => {
  assert.equal(
    resolveFutureOneTimeTransactionGroup(
      {
        confirmed: false,
        date: "2026-08-15",
      },
      "2026-07-22",
    ),
    "planned",
  );
});

test("due once stays only in due", () => {
  assert.equal(
    resolveFutureOneTimeTransactionGroup(
      {
        confirmed: false,
        date: "2026-08-15",
      },
      "2026-08-15",
    ),
    "due",
  );
});

test("overdue once stays only in due", () => {
  assert.equal(
    resolveFutureOneTimeTransactionGroup(
      {
        confirmed: false,
        date: "2026-08-15",
      },
      "2026-08-20",
    ),
    "due",
  );
});

test("confirmed once stays only in paid", () => {
  assert.equal(
    resolveFutureOneTimeTransactionGroup(
      {
        confirmed: true,
        date: "2026-08-15",
      },
      "2026-08-20",
    ),
    "paid",
  );
});

test("future recurring occurrence uses scheduled occurrence date and stays planned", () => {
  assert.equal(
    resolveFutureRecurringOperationGroup(
      {
        paid: false,
        resolvedStatus: "upcoming",
        scheduledDate: "2026-08-15",
      },
      "2026-07-22",
    ),
    "planned",
  );
});

test("due recurring occurrence stays in due", () => {
  assert.equal(
    resolveFutureRecurringOperationGroup(
      {
        paid: false,
        resolvedStatus: "pending",
        scheduledDate: "2026-08-15",
      },
      "2026-08-15",
    ),
    "due",
  );
});

test("paid recurring occurrence stays in paid and does not depend on scheduled date", () => {
  assert.equal(
    resolveFutureRecurringOperationGroup(
      {
        paid: true,
        resolvedStatus: "paid",
        scheduledDate: "2026-08-15",
      },
      "2026-07-22",
    ),
    "paid",
  );
});

test("confirmed recurring payment with actual date different from scheduled date still groups by scheduled occurrence date", () => {
  assert.equal(
    resolveFutureRecurringOperationGroup(
      {
        paid: false,
        resolvedStatus: "rescheduled",
        scheduledDate: "2026-08-18",
      },
      "2026-07-22",
    ),
    "planned",
  );
});

test("planned items for the current month stay in the main planned section", () => {
  const result = splitPlannedFutureOperationsByMonth(
    [
      { sortDate: "2026-07-25", id: "july-rent" },
      { sortDate: "2026-07-28", id: "july-gym" },
      { sortDate: "2026-08-01", id: "august-internet" },
    ],
    "2026-07-22",
  );

  assert.deepEqual(
    result.currentMonth.map((item) => item.id),
    ["july-rent", "july-gym"],
  );
  assert.deepEqual(result.laterMonths, [
    {
      monthKey: "2026-08",
      items: [{ sortDate: "2026-08-01", id: "august-internet" }],
    },
  ]);
});

test("planned items after the current month are grouped into later month buckets", () => {
  const result = splitPlannedFutureOperationsByMonth(
    [
      { sortDate: "2026-08-01", id: "august-internet" },
      { sortDate: "2026-08-07", id: "august-music" },
      { sortDate: "2026-09-03", id: "september-insurance" },
    ],
    "2026-07-22",
  );

  assert.deepEqual(result.currentMonth, []);
  assert.deepEqual(result.laterMonths, [
    {
      monthKey: "2026-08",
      items: [
        { sortDate: "2026-08-01", id: "august-internet" },
        { sortDate: "2026-08-07", id: "august-music" },
      ],
    },
    {
      monthKey: "2026-09",
      items: [{ sortDate: "2026-09-03", id: "september-insurance" }],
    },
  ]);
});

test("planning panel uses planned due and paid sections instead of the old unpaid grouping", () => {
  assert.match(planningPanelSource, /planningRecurringSectionPlanned/);
  assert.match(planningPanelSource, /planningRecurringSectionDue/);
  assert.match(planningPanelSource, /planningRecurringSectionPaid/);
  assert.match(planningPanelSource, /resolveFutureOneTimeTransactionGroup/);
  assert.match(planningPanelSource, /resolveFutureRecurringOperationGroup/);
  assert.match(planningPanelSource, /splitPlannedFutureOperationsByMonth/);
  assert.match(planningPanelSource, /expandedFutureMonths/);
  assert.match(planningPanelSource, /aria-expanded/);
  assert.match(planningPanelSource, /section\.key\.startsWith\("later-"\)/);
  assert.doesNotMatch(planningPanelSource, /setRecurringFilter/);
});

test("planning panel syncs one-time future date from the input before submit", () => {
  assert.match(planningPanelSource, /recStartDateInputRef/);
  assert.match(planningPanelSource, /normalizeIsoDate\(recStartDateInputRef\.current\?\.value\)/);
  assert.match(planningPanelSource, /onInput=\{\(e\) => handleRecStartDateInput\(e\.currentTarget\.value\)\}/);
});

test("planning panel keeps one-time operations only while they are still pending", () => {
  assert.match(planningPanelSource, /\.filter\(\(transaction\) => transaction\.confirmed === false\)/);
  assert.doesNotMatch(
    planningPanelSource,
    /transaction\.confirmed === false\s*\|\|\s*transaction\.date\.slice\(0, 10\) >= recurringPeriod\.from/,
  );
});
