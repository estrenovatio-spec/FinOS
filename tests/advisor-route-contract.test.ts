import assert from "node:assert/strict";
import test from "node:test";

async function callAdvisorRoute(body: unknown) {
  const mod = await import("@/app/api/advisor-question/route");
  const response = await mod.POST(
    new Request("http://localhost/api/advisor-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  );
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

test("advisor route accepts the current minimal context contract", async () => {
  const result = await callAdvisorRoute({
    locale: "ru",
    question: "Тестовый вопрос",
    context: {
      cards: [{ label: "Баланс", value: "10 000 ₽", note: "Тест" }],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.json.error, undefined);
  assert.equal(typeof result.json.answer, "string");
});

test("advisor route accepts legacy advisorContext alias", async () => {
  const result = await callAdvisorRoute({
    locale: "ru",
    question: "Тестовый вопрос",
    advisorContext: {
      cards: [{ label: "Баланс", value: "10 000 ₽", note: "Тест" }],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.json.error, undefined);
  assert.equal(typeof result.json.answer, "string");
});

test("advisor route rejects empty question", async () => {
  const result = await callAdvisorRoute({
    locale: "ru",
    question: "",
    context: {
      cards: [{ label: "Баланс", value: "10 000 ₽", note: "Тест" }],
    },
  });

  assert.equal(result.status, 400);
  assert.equal(result.json.error, "invalid_request");
  assert.equal(
    result.json.userMessage,
    "Не удалось отправить вопрос. Обновите страницу и попробуйте ещё раз.",
  );
});

test("advisor route rejects missing context", async () => {
  const result = await callAdvisorRoute({
    locale: "ru",
    question: "Тестовый вопрос",
  });

  assert.equal(result.status, 400);
  assert.equal(result.json.error, "invalid_request");
  assert.equal(
    result.json.userMessage,
    "Не удалось отправить вопрос. Обновите страницу и попробуйте ещё раз.",
  );
});

test("advisor route returns safe user error when cards are missing", async () => {
  const result = await callAdvisorRoute({
    locale: "ru",
    question: "Тестовый вопрос",
    context: {},
  });

  assert.equal(result.status, 400);
  assert.equal(result.json.error, "invalid_request");
  assert.equal(
    result.json.userMessage,
    "Не удалось отправить вопрос. Обновите страницу и попробуйте ещё раз.",
  );
});
