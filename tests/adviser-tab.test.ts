import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const planningPanel = readFileSync("src/components/PlanningPanel.tsx", "utf8");
const forecastTab = readFileSync("src/components/app/ForecastTab.tsx", "utf8");

test("Planning panel exposes a dedicated adviser tab next to statistics", () => {
  assert.match(planningPanel, /value="stats"[\s\S]*Статистика[\s\S]*value="advisor"/);
  assert.match(planningPanel, /Советник/);
  assert.match(planningPanel, /Advisor/);
});

test("Adviser tab reuses the existing AI analysis content", () => {
  assert.match(planningPanel, /import \{ AiAnalysisTab \}/);
  assert.match(planningPanel, /<TabsContent value="advisor"/);
  assert.match(planningPanel, /<AiAnalysisTab active=\{planningTab === "advisor"\}/);
});

test("Forecast tab no longer duplicates the old mixed adviser panel", () => {
  assert.doesNotMatch(forecastTab, /TipsPanel/);
});
