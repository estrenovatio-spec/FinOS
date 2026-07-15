import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPlannedFreeMoneySummary } from "@/lib/planned-free-money-presenter";

test("planned free money summary uses human wording and long Russian date", () => {
  const summary = buildPlannedFreeMoneySummary("ru", {
    status: "available",
    amount: 35188,
    periodEndDate: "2026-07-31",
    periodStartDate: "2026-07-15",
    expectedRecurringIncome: 49000,
    includesUnconfirmedIncome: true,
    breakdown: null,
    note: null,
  });

  assert.equal(summary?.label, "Можно потратить");
  assert.equal(summary?.subtitle, "до 31 июля 2026");
  assert.match(summary?.caption ?? "", /базовых расходов/i);
  assert.doesNotMatch(summary?.caption ?? "", /recurring|essential|period|forecast|planned/i);
});

test("product language dictionary documents the main term replacements", () => {
  const source = readFileSync("product-language.md", "utf8");

  assert.match(source, /free money` → `Можно потратить`/);
  assert.match(source, /forecast` → `Прогноз`/);
  assert.match(source, /recurring` → `Регулярный платёж`/);
  assert.match(source, /essential` → `базовые расходы`/);
});

test("advisor context uses human wording for spendable money and recurring items", () => {
  const source = readFileSync("src/lib/advisor-context.ts", "utf8");

  assert.match(source, /"Можно потратить"/);
  assert.match(source, /"Регулярные платежи и доходы"/);
  assert.doesNotMatch(source, /"Регулярные операции"/);
});
