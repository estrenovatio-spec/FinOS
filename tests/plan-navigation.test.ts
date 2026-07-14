import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const appBottomNavSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/app/AppBottomNav.tsx"),
  "utf8",
);
const forecastTabSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/app/ForecastTab.tsx"),
  "utf8",
);
const planTabSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/app/PlanTab.tsx"),
  "utf8",
);
const pageSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/page.tsx"),
  "utf8",
);
const planningPanelSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/PlanningPanel.tsx"),
  "utf8",
);
const tabStorageSource = fs.readFileSync(
  path.join(process.cwd(), "src/lib/app-bottom-nav.ts"),
  "utf8",
);
const planStorageSource = fs.readFileSync(
  path.join(process.cwd(), "src/lib/plan-navigation.ts"),
  "utf8",
);

test("bottom nav contains Plan and no longer uses recurring as the fourth app tab", () => {
  assert.match(appBottomNavSource, /id: "plan"/);
  assert.doesNotMatch(appBottomNavSource, /id: "recurring"/);
  assert.match(appBottomNavSource, /text-center whitespace-normal/);
});

test("forecast tab is read-only and links into plan instead of rendering planning forms inline", () => {
  assert.doesNotMatch(forecastTabSource, /<PlanningPanel/);
  assert.match(forecastTabSource, /Изменить план/);
  assert.match(forecastTabSource, /onOpenPlan/);
});

test("plan tab reuses planning panel sections for recurring goals limits debts and funds", () => {
  assert.match(planTabSource, /<PlanningPanel/);
  assert.match(planTabSource, /visibleTabs=\{\["recurring", "goals", "limits", "debts", "funds", "emergency"\]\}/);
  assert.match(planTabSource, /Доходы, платежи, цели и бюджеты на будущее/);
});

test("planning panel supports controlled sections and entity focus for deep links", () => {
  assert.match(planningPanelSource, /activeTab\?: PlanningTab/);
  assert.match(planningPanelSource, /onActiveTabChange\?: \(tab: PlanningTab\) => void/);
  assert.match(planningPanelSource, /focusEntityId\?: string \| null/);
  assert.match(planningPanelSource, /data-plan-entity-id=/);
});

test("page wires Plan tab state separately from Forecast focus", () => {
  assert.match(pageSource, /const \[planSection, setPlanSection\] = useState<PlanSection>\("recurring"\)/);
  assert.match(pageSource, /readStoredPlanSection/);
  assert.match(pageSource, /writeStoredPlanSection/);
  assert.match(pageSource, /onAppViewChange\("plan"/);
});

test("legacy tab state migrates recurring and regulars into plan recurring", () => {
  assert.match(tabStorageSource, /raw === "business" \|\| raw === "recurring" \|\| raw === "regulars"/);
  assert.match(planStorageSource, /case "regulars":/);
  assert.match(planStorageSource, /search\.get\("tab"\)/);
  assert.match(planStorageSource, /LEGACY_TAB_STORAGE_KEY/);
  assert.match(planStorageSource, /return "recurring"/);
});
