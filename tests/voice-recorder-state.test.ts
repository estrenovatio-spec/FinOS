import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/VoiceRecorder.tsx", import.meta.url), "utf8");

test("voice recorder uses one explicit UI state machine", () => {
  assert.match(source, /type VoiceUiState = "idle" \| "recording" \| "processing"/);
  assert.match(source, /const \[voiceState, setVoiceState\] = useState<VoiceUiState>\("idle"\)/);
  assert.match(source, /const recording = voiceState === "recording"/);
  assert.match(source, /const voiceProcessing = voiceState === "processing"/);
});

test("voice recorder keeps one visible control and cleans up recording on unmount", () => {
  assert.ok(source.includes('return (\n    <section'));
  assert.match(source, /void cancelVoiceRecording\(\)/);
  assert.doesNotMatch(source, /busy && !recording \?/);
});
