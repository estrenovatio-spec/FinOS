import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const todayOverviewSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/today/TodayOverview.tsx"),
  "utf8",
);

test("planned free money card is expandable with a chevron toggle", () => {
  assert.match(todayOverviewSource, /ChevronDown/);
  assert.match(todayOverviewSource, /ChevronUp/);
  assert.match(todayOverviewSource, /setExpandedItemId/);
  assert.match(todayOverviewSource, /item\.details && item\.details\.length > 0/);
});

test("planned breakdown uses a mobile-safe two-column grid without horizontal overflow helpers", () => {
  assert.match(
    todayOverviewSource,
    /grid grid-cols-\[minmax\(0,1fr\)_auto\] items-start gap-x-3 gap-y-1 text-sm/,
  );
  assert.match(todayOverviewSource, /break-words text-muted-foreground/);
  assert.match(todayOverviewSource, /whitespace-nowrap text-right/);
});

test("planned free money card keeps a prominent add-operation CTA inside the card", () => {
  assert.match(todayOverviewSource, /item\.actionVariant === "primary"/);
  assert.match(todayOverviewSource, /w-full rounded-xl bg-primary/);
});
