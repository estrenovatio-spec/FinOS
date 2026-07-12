import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLlmFallbackLog,
  classifyLlmError,
  extractReplyFromChatCompletion,
  type SafeLlmFallbackLog,
} from "@/lib/llm-diagnostics";

test("missing key is classified as missing_api_key at route level", () => {
  const log = buildLlmFallbackLog({
    requestId: "req-1",
    route: "weekly-chat",
    failureKind: "missing_api_key",
    durationMs: 12,
    hasClient: false,
  });

  assert.equal(log.failureKind, "missing_api_key");
  assert.equal(log.hasClient, false);
});

test("401 is classified as unauthorized", () => {
  assert.deepEqual(classifyLlmError({ status: 401 }), {
    failureKind: "unauthorized",
    statusCode: 401,
  });
});

test("429 is classified as rate_limited", () => {
  assert.deepEqual(classifyLlmError({ status: 429 }), {
    failureKind: "rate_limited",
    statusCode: 429,
  });
});

test("other 4xx is classified as upstream_4xx", () => {
  assert.deepEqual(classifyLlmError({ status: 422 }), {
    failureKind: "upstream_4xx",
    statusCode: 422,
  });
});

test("5xx is classified as upstream_5xx", () => {
  assert.deepEqual(classifyLlmError({ statusCode: 502 }), {
    failureKind: "upstream_5xx",
    statusCode: 502,
  });
});

test("timeout is classified separately", () => {
  assert.deepEqual(classifyLlmError(new Error("Request timed out after 25000ms")), {
    failureKind: "timeout",
    statusCode: null,
  });
});

test("network error is classified separately", () => {
  assert.deepEqual(classifyLlmError(new Error("fetch failed: socket hang up")), {
    failureKind: "network_error",
    statusCode: null,
  });
});

test("missing choices is invalid_response", () => {
  assert.deepEqual(extractReplyFromChatCompletion({}), {
    ok: false,
    failureKind: "invalid_response",
  });
});

test("empty content is empty_response", () => {
  assert.deepEqual(
    extractReplyFromChatCompletion({
      choices: [{ message: { content: "   " } }],
    }),
    {
      ok: false,
      failureKind: "empty_response",
    },
  );
});

test("unknown exception maps to unknown", () => {
  assert.deepEqual(classifyLlmError({ foo: "bar" }), {
    failureKind: "unknown",
    statusCode: null,
  });
});

test("safe diagnostics log does not contain user payload fields", () => {
  const log: SafeLlmFallbackLog = buildLlmFallbackLog({
    requestId: "req-2",
    route: "monthly-chat",
    failureKind: "invalid_response",
    statusCode: 200,
    durationMs: 34,
    hasClient: true,
  });

  const keys = Object.keys(log).sort();
  assert.deepEqual(keys, [
    "durationMs",
    "failureKind",
    "hasApiKey",
    "hasClient",
    "model",
    "provider",
    "requestId",
    "route",
    "statusCode",
  ]);
  assert.equal("question" in log, false);
  assert.equal("messages" in log, false);
  assert.equal("summary" in log, false);
  assert.equal("apiKey" in log, false);
});
