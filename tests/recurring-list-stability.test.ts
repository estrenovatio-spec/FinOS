import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const planningPanelSource = readFileSync("src/components/PlanningPanel.tsx", "utf8");

test("recurring cards keep date order and original order instead of re-sorting by status", () => {
  assert.match(planningPanelSource, /originalIndex = recurringTransactions\.findIndex/);
  assert.match(planningPanelSource, /const dateDiff = a\.sortDate\.localeCompare\(b\.sortDate\);/);
  assert.match(planningPanelSource, /return a\.originalIndex - b\.originalIndex;/);
  assert.doesNotMatch(planningPanelSource, /const priority = \{ pending: 0, overdue: 1, upcoming: 2, paused: 3, paid: 4 \}/);
});
