import assert from "node:assert/strict";
import test from "node:test";
import { getLlmApiKey, getLlmBaseUrl, getLlmModel, getLlmProvider, getSafeLlmConfigDebug } from "@/lib/llm";

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("llm env values are trimmed and unquoted before use", () => {
  withEnv(
    {
      LLM_API_KEY: '  "sk-test-1234"  ',
      LLM_PROVIDER: " apinet ",
      LLM_BASE_URL: ' "https://apinet.cloud/v1/" ',
      LLM_MODEL: ' "gpt-4o-mini" ',
    },
    () => {
      assert.equal(getLlmApiKey(), "sk-test-1234");
      assert.equal(getLlmProvider(), "apinet");
      assert.equal(getLlmBaseUrl(), "https://apinet.cloud/v1");
      assert.equal(getLlmModel(), "gpt-4o-mini");
    },
  );
});

test("safe llm debug exposes only config metadata and key prefix", () => {
  withEnv(
    {
      LLM_API_KEY: "sk-secret-987654",
      LLM_PROVIDER: "apinet",
      LLM_BASE_URL: "https://apinet.cloud/v1",
      LLM_MODEL: "gpt-4o-mini",
    },
    () => {
      const debug = getSafeLlmConfigDebug();

      assert.deepEqual(debug, {
        provider: "apinet",
        baseUrl: "https://apinet.cloud/v1",
        model: "gpt-4o-mini",
        hasApiKey: true,
        keyPrefix: "sk-s",
      });
      assert.equal("apiKey" in (debug as Record<string, unknown>), false);
    },
  );
});
