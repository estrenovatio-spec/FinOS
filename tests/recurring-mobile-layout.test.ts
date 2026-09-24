import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const planningPanelSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/PlanningPanel.tsx"),
  "utf8",
);

test("recurring form keeps one outer card while stacking select rows on mobile", () => {
  assert.match(
    planningPanelSource,
    /grid grid-cols-1 gap-2 sm:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/,
  );
  assert.match(
    planningPanelSource,
    /rounded-\[24px\] border border-border\/70 bg-background\/95 p-4 pb-\[calc\(8rem\+env\(safe-area-inset-bottom\)\)\]/,
  );
});

test("select-like fields reserve room for icon, label, and chevron", () => {
  assert.match(
    planningPanelSource,
    /grid h-12 w-full min-w-0 grid-cols-\[auto_minmax\(0,1fr\)_auto\] items-center gap-2 rounded-\[16px\]/,
  );
  assert.match(planningPanelSource, /<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" \/>/);
  assert.match(planningPanelSource, /className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"/);
});

test("recurring labels use compact mobile-friendly wording", () => {
  assert.match(planningPanelSource, /"Ежемесячно"/);
  assert.match(planningPanelSource, /"Еженедельно"/);
  assert.match(planningPanelSource, /"Ежегодно"/);
});

test("duration cards stay compact in one row on mobile", () => {
  assert.match(planningPanelSource, /mt-2 grid grid-cols-3 gap-2/);
  assert.match(planningPanelSource, /min-h-\[92px\] flex-col items-start rounded-\[16px\]/);
  assert.match(
    planningPanelSource,
    /rounded-\[22px\] border border-border\/50 bg-background\/96 p-1 shadow-sm shadow-black\/5/,
  );
  assert.match(planningPanelSource, /className="h-\[52px\] w-full rounded-\[18px\] px-4 text-sm font-semibold/);
});

test("recurring form avoids extra helper headings above compact fields", () => {
  assert.doesNotMatch(planningPanelSource, /Что создаём\?/);
  assert.doesNotMatch(planningPanelSource, /Название операции/);
  assert.doesNotMatch(planningPanelSource, /Детали операции/);
  assert.doesNotMatch(planningPanelSource, /Например: Аренда/);
  assert.match(planningPanelSource, /"Аренда, интернет, зарплата"/);
});
