import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const planningPanelSource = readFileSync("src/components/PlanningPanel.tsx", "utf8");

test("recurring cards keep date order within each visible status group", () => {
  assert.match(planningPanelSource, /originalIndex = recurringTransactions\.findIndex/);
  assert.match(planningPanelSource, /sections\.planned\.sort\(\(left, right\) => left\.sortDate\.localeCompare\(right\.sortDate\)\)/);
  assert.match(planningPanelSource, /sections\.due\.sort\(\(left, right\) => left\.sortDate\.localeCompare\(right\.sortDate\)\)/);
  assert.match(planningPanelSource, /sections\.paid\.sort\(\(left, right\) => right\.sortDate\.localeCompare\(left\.sortDate\)\)/);
});
