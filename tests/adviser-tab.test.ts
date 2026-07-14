import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const planningPanel = readFileSync("src/components/PlanningPanel.tsx", "utf8");
const forecastTab = readFileSync("src/components/app/ForecastTab.tsx", "utf8");
const planTab = readFileSync("src/components/app/PlanTab.tsx", "utf8");
const aiAnalysisTab = readFileSync("src/components/AiAnalysisTab.tsx", "utf8");

test("Planning panel exposes a dedicated adviser tab next to statistics", () => {
  assert.match(planningPanel, /value="stats"[\s\S]*Статистика[\s\S]*value="advisor"/);
  assert.match(planningPanel, /Советник/);
  assert.match(planningPanel, /Advisor/);
});

test("Adviser tab reuses the existing AI analysis content", () => {
  assert.match(planningPanel, /import \{ AiAnalysisTab \}/);
  assert.match(planningPanel, /<TabsContent value="advisor"/);
  assert.match(planningPanel, /<AiAnalysisTab active=\{currentPlanningTab === "advisor"\}/);
});

test("Forecast tab no longer duplicates the old mixed adviser panel", () => {
  assert.doesNotMatch(forecastTab, /TipsPanel/);
});

test("Plan tab exposes statistics and adviser in the visible planning tabs", () => {
  assert.match(planTab, /visibleTabs=\{\["recurring", "goals", "limits", "debts", "funds", "emergency", "stats", "advisor"\]\}/);
});

test("Adviser screen shows a clear title and real starter questions", () => {
  assert.match(aiAnalysisTab, /Финансовый советник/);
  assert.match(aiAnalysisTab, /Задайте вопрос о своих деньгах и планах/);
  assert.match(aiAnalysisTab, /Могу ли я сейчас сделать покупку на 10 000 ₽\?/);
  assert.match(aiAnalysisTab, /Что будет, если доход задержится\?/);
});
