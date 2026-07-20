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

test("voice recorder keeps the same fixed button size in every state", () => {
  assert.match(source, /className="h-11 w-11 shrink-0 border-primary\/20 bg-primary\/5 p-0"/);
  assert.match(source, /className="h-11 w-11 shrink-0 p-0"/);
  assert.match(source, /<Square className="h-5 w-5 fill-current" aria-hidden \/>/);
  assert.doesNotMatch(source, /width:auto|width:fit-content|display:none|visibility:hidden/);
});
