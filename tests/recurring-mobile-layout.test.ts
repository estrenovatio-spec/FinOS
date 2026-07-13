import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const planningPanelSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/PlanningPanel.tsx"),
  "utf8",
);

test("recurring add form uses a single-column mobile layout before widening", () => {
  assert.match(planningPanelSource, /grid grid-cols-1 gap-2 sm:grid-cols-2/);
  assert.match(planningPanelSource, /<div className="grid grid-cols-1 gap-2">/);
});

test("recurring end selector stays vertical on mobile with full-width add button", () => {
  assert.match(planningPanelSource, /Когда закончится\?/);
  assert.match(planningPanelSource, /<div className="grid grid-cols-1 gap-2">/);
  assert.match(planningPanelSource, /<Button className="w-full" onClick={handleAddRecurring}>/);
});

test("recurring cards avoid narrow inline date controls on mobile", () => {
  assert.match(
    planningPanelSource,
    /flex flex-col items-start gap-1\.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2/,
  );
  assert.match(planningPanelSource, /className="h-8 w-full text-xs sm:w-auto sm:max-w-\[10\.5rem\]"/);
  assert.match(planningPanelSource, /className="mt-2 flex flex-wrap justify-end gap-2 border-t border-border\/50 pt-2"/);
});
