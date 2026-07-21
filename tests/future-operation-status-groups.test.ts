import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveFutureOneTimeTransactionGroup,
  resolveFutureRecurringOperationGroup,
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

test("planning panel uses planned due and paid sections instead of the old unpaid grouping", () => {
  assert.match(planningPanelSource, /planningRecurringSectionPlanned/);
  assert.match(planningPanelSource, /planningRecurringSectionDue/);
  assert.match(planningPanelSource, /planningRecurringSectionPaid/);
  assert.match(planningPanelSource, /resolveFutureOneTimeTransactionGroup/);
  assert.match(planningPanelSource, /resolveFutureRecurringOperationGroup/);
  assert.doesNotMatch(planningPanelSource, /setRecurringFilter/);
});

test("planning panel syncs one-time future date from the input before submit", () => {
  assert.match(planningPanelSource, /recStartDateInputRef/);
  assert.match(planningPanelSource, /normalizeIsoDate\(recStartDateInputRef\.current\?\.value\)/);
  assert.match(planningPanelSource, /onInput=\{\(e\) => handleRecStartDateInput\(e\.currentTarget\.value\)\}/);
});
