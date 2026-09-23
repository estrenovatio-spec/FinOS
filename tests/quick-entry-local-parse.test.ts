import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultCategories } from "@/lib/categories";
import { parseVoiceTranscripts } from "@/lib/voice";

test("quick text entry is parsed locally without a server request", async () => {
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = async () => {
    requested = true;
    throw new Error("A quick entry must not wait for a server parser");
  };

  try {
    const parsed = await parseVoiceTranscripts(
      "500 продукты",
      "ru",
      getDefaultCategories(),
    );
    assert.equal(requested, false);
    assert.equal(parsed?.items[0]?.amount, 500);
    assert.equal(parsed?.items[0]?.type, "expense");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
