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

test("Adviser screen now starts from a dedicated questions hub with contextual prompts", () => {
  assert.match(aiAnalysisTab, /Финансовый советник/);
  assert.match(aiAnalysisTab, /value="questions"/);
  assert.match(aiAnalysisTab, /Вопросы/);
  assert.match(aiAnalysisTab, /О чём можно спросить/);
  assert.match(aiAnalysisTab, /buildAdvisorContext/);
  assert.match(aiAnalysisTab, /Ваш вопрос/);
  assert.match(aiAnalysisTab, /sendAdvisorQuestion/);
  assert.match(aiAnalysisTab, /fetch\("\/api\/advisor-question"/);
  assert.match(aiAnalysisTab, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(aiAnalysisTab, /Отправить →/);
  assert.match(aiAnalysisTab, /Анализирую ваши финансы\.\.\./);
  assert.match(aiAnalysisTab, /Не удалось получить ответ/);
  assert.match(aiAnalysisTab, /Открыть разбор на 7 дней/);
  assert.match(aiAnalysisTab, /Открыть разбор на 30 дней/);
});

test("Advisor context builder prepares cards for balance, free money, forecast, goals, recurring and limits", () => {
  const advisorContext = readFileSync("src/lib/advisor-context.ts", "utf8");

  assert.match(advisorContext, /id: "balance"/);
  assert.match(advisorContext, /id: "free_money"/);
  assert.match(advisorContext, /id: "forecast"/);
  assert.match(advisorContext, /id: "goals"/);
  assert.match(advisorContext, /id: "recurring"/);
  assert.match(advisorContext, /id: "limits"/);
});

test("App shell uses the new first-launch onboarding instead of the legacy family overlay", () => {
  const pageSource = readFileSync("src/app/page.tsx", "utf8");
  const onboardingSource = readFileSync("src/components/FirstLaunchOnboardingDialog.tsx", "utf8");

  assert.match(pageSource, /FirstLaunchOnboardingDialog/);
  assert.doesNotMatch(pageSource, /<FamilyOnboarding/);
  assert.match(onboardingSource, /Вход и синхронизация/);
  assert.match(onboardingSource, /Доходы/);
  assert.match(onboardingSource, /Обязательные платежи/);
  assert.match(onboardingSource, /Лимиты и базовые траты/);
  assert.match(onboardingSource, /Перейти в Today/);
});
