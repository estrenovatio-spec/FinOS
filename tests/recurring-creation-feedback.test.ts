import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const planningPanelSource = readFileSync("src/components/PlanningPanel.tsx", "utf8");

test("creating an operation gives success feedback", () => {
  assert.match(planningPanelSource, /import \{ useToast \} from "@\/components\/ui\/toast"/);
  assert.match(planningPanelSource, /Операция «\$\{title\}» на \$\{formatMoney\(amount, locale\)\} создана/);
  assert.match(planningPanelSource, /Регулярный \$\{recType === "income" \? "доход" : "платёж"\} «\$\{title\}»/);
  assert.match(planningPanelSource, /"success"/);
});
