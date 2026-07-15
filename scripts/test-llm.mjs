#!/usr/bin/env node
/**
 * Локальная проверка apinet / LLM:
 *   LLM_API_KEY=sk-... LLM_BASE_URL=https://apinet.cloud/v1 LLM_MODEL=gpt-4o-mini node scripts/test-llm.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
const baseUrl = (process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "").replace(/\/$/, "");
const model = process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!apiKey) {
  console.error("Нет LLM_API_KEY в .env.local");
  process.exit(1);
}
if (!baseUrl) {
  console.error("Нет LLM_BASE_URL — например https://apinet.cloud/v1");
  process.exit(1);
}

const prompt = 'Верни JSON: {"amount":500,"type":"expense","categoryId":"dining_out","currency":"RUB","note":"обед","date":"2026-05-24"}';

const res = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: prompt }],
  }),
});

const text = await res.text();
console.log("HTTP", res.status);
console.log(text.slice(0, 800));

if (!res.ok) process.exit(1);
