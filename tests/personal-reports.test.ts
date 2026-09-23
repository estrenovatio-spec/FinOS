import assert from "node:assert/strict";
import test from "node:test";
import { buildBudgetExcelWorkbook } from "../src/lib/export/transactions-export";

test("personal settings report excludes business transactions and business sheets", () => {
  const workbook = buildBudgetExcelWorkbook({
    transactions: [
      {
        id: "personal-1",
        type: "expense",
        amount: 1250,
        categoryId: "groceries",
        currency: "RUB",
        date: "2026-09-23",
        note: "Personal grocery note",
        owner: "me",
        confirmed: true,
      },
    ],
    categories: [],
    businessTransactions: [
      {
        id: "business-1",
        unitId: "unit-1",
        kind: "operating_income",
        type: "income",
        amount: 99000,
        date: "2026-09-23",
        note: "Business income must stay out",
        createdAt: "2026-09-23T00:00:00.000Z",
      },
    ],
    businessUnits: [
      {
        id: "unit-1",
        name: "Studio",
        color: "#000000",
        createdAt: "2026-09-01",
      },
    ],
    businessAssets: [],
    locale: "en",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    scope: "personal",
  });

  const content = new TextDecoder().decode(workbook);
  assert.match(content, /Personal summary/);
  assert.match(content, /Personal entries/);
  assert.match(content, /Personal grocery note/);
  assert.doesNotMatch(content, /Business income must stay out/);
  assert.doesNotMatch(content, /Business summary/);
  assert.doesNotMatch(content, /Projects/);
});
