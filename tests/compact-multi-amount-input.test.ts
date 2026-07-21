import assert from "node:assert/strict";
import test from "node:test";
import { fallbackParseMany } from "@/lib/ai";
import { getDefaultCategories } from "@/lib/categories";
import {
  extractCompactMultiAmountInput,
  extractSeparatedMoneyAmounts,
} from "@/lib/multiple-amounts";
import { parseTranscriptServerMany } from "@/lib/parse-voice-server";
import { useStore } from "@/store/useStore";

test("compact helper extracts one label with multiple amounts", () => {
  assert.deepEqual(extractCompactMultiAmountInput("еда 300 500 700"), {
    label: "еда",
    amounts: [300, 500, 700],
  });
  assert.deepEqual(extractSeparatedMoneyAmounts("такси 200 350"), [200, 350]);
});

test("compact helper also extracts trailing labels after several amounts", () => {
  assert.deepEqual(extractCompactMultiAmountInput("100 200 300 продукты"), {
    label: "продукты",
    amounts: [100, 200, 300],
  });
  assert.deepEqual(extractCompactMultiAmountInput("500 700 900 бензин"), {
    label: "бензин",
    amounts: [500, 700, 900],
  });
});

test("compact helper does not trigger for mixed entities", () => {
  assert.equal(extractCompactMultiAmountInput("еда 300 и кофе 200"), null);
  assert.equal(extractCompactMultiAmountInput("кофе 300, обед 500"), null);
});

test("compact helper does not split model-like names", () => {
  assert.equal(extractCompactMultiAmountInput("айфон 15 50000"), null);
  assert.deepEqual(extractSeparatedMoneyAmounts("айфон 15 50000"), []);
});

test("fallback parser expands one label with multiple amounts into multiple expenses", () => {
  const items = fallbackParseMany("еда 300 500 700", "ru", getDefaultCategories());

  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((item) => item.amount),
    [300, 500, 700],
  );
  assert(items.every((item) => item.type === "expense"));
  assert(items.every((item) => item.note === "еда"));
  assert(items.every((item) => item.categoryId === items[0]?.categoryId));
});

test("single amount phrases keep one transaction", () => {
  const rent = fallbackParseMany("аренда 50000", "ru", getDefaultCategories());
  const salary = fallbackParseMany("зарплата 120000", "ru", getDefaultCategories());

  assert.equal(rent.length, 1);
  assert.equal(rent[0]?.amount, 50000);
  assert.equal(salary.length, 1);
  assert.equal(salary[0]?.amount, 120000);
  assert.equal(salary[0]?.type, "income");
});

test("server voice parser fallback keeps compact multi-amount expansion", async () => {
  const previousLlmKey = process.env.LLM_API_KEY;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  delete process.env.LLM_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const result = await parseTranscriptServerMany(
      "такси 200 300 400",
      "ru",
      getDefaultCategories(),
    );

    assert.equal(result.fallback, true);
    assert.equal(result.items.length, 3);
    assert.deepEqual(
      result.items.map((item) => item.amount),
      [200, 300, 400],
    );
    assert(result.items.every((item) => item.type === "expense"));
    assert(result.items.every((item) => item.note === "такси"));
  } finally {
    if (previousLlmKey == null) {
      delete process.env.LLM_API_KEY;
    } else {
      process.env.LLM_API_KEY = previousLlmKey;
    }
    if (previousOpenAiKey == null) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  }
});

test("store keeps split amounts instead of reparsing the whole compact phrase into one giant number", () => {
  const previousState = useStore.getState();

  useStore.setState({
    ...previousState,
    locale: "ru",
    categories: getDefaultCategories(),
    transactions: [],
  });

  const parsed = fallbackParseMany("еда 1078 510 419", "ru", getDefaultCategories());
  assert.equal(parsed.length, 3);

  for (const item of parsed) {
    useStore.getState().addTransaction(item, "еда 1078 510 419");
  }

  assert.deepEqual(
    useStore
      .getState()
      .transactions.map((item) => item.amount)
      .sort((a, b) => b - a),
    [1078, 510, 419],
  );

  useStore.setState(previousState);
});

test("fallback parser keeps multiple separate operations for all supported compact examples", () => {
  assert.deepEqual(
    fallbackParseMany("еда 100 200 300", "ru", getDefaultCategories()).map((item) => item.amount),
    [100, 200, 300],
  );
  assert.deepEqual(
    fallbackParseMany("такси 500 700", "ru", getDefaultCategories()).map((item) => item.amount),
    [500, 700],
  );
  assert.deepEqual(
    fallbackParseMany("100 200 300 продукты", "ru", getDefaultCategories()).map((item) => item.amount),
    [100, 200, 300],
  );
  assert.deepEqual(
    fallbackParseMany("500, 700, 900 бензин", "ru", getDefaultCategories()).map((item) => item.amount),
    [500, 700, 900],
  );
});
