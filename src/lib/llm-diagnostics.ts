import { getLlmApiKey, getLlmModel, getLlmProvider } from "@/lib/llm";

export type LlmFailureKind =
  | "missing_api_key"
  | "client_init_failed"
  | "unauthorized"
  | "rate_limited"
  | "upstream_4xx"
  | "upstream_5xx"
  | "timeout"
  | "network_error"
  | "empty_response"
  | "invalid_response"
  | "unknown";

export type LlmRouteName = "weekly-chat" | "monthly-chat";

export type SafeLlmFallbackLog = {
  requestId: string;
  route: LlmRouteName;
  provider: string;
  model: string;
  failureKind: LlmFailureKind;
  statusCode: number | null;
  durationMs: number;
  hasApiKey: boolean;
  hasClient: boolean;
};

type FailureMeta = {
  failureKind: LlmFailureKind;
  statusCode: number | null;
};

type CompletionReply =
  | { ok: true; reply: string }
  | { ok: false; failureKind: "empty_response" | "invalid_response" };

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { status?: unknown; statusCode?: unknown }).statusCode;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function toMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return stringOrEmpty((error as { message?: unknown }).message).toLowerCase();
}

function toCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return stringOrEmpty((error as { code?: unknown }).code).toLowerCase();
}

function toName(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return stringOrEmpty((error as { name?: unknown }).name).toLowerCase();
}

export function classifyLlmError(error: unknown): FailureMeta {
  const statusCode = toStatusCode(error);
  if (statusCode === 401 || statusCode === 403) {
    return { failureKind: "unauthorized", statusCode };
  }
  if (statusCode === 429) {
    return { failureKind: "rate_limited", statusCode };
  }
  if (statusCode != null && statusCode >= 400 && statusCode < 500) {
    return { failureKind: "upstream_4xx", statusCode };
  }
  if (statusCode != null && statusCode >= 500) {
    return { failureKind: "upstream_5xx", statusCode };
  }

  const message = toMessage(error);
  const code = toCode(error);
  const name = toName(error);
  const haystack = [message, code, name].filter(Boolean).join(" ");

  if (
    haystack.includes("timeout")
    || haystack.includes("timed out")
    || haystack.includes("etimedout")
    || haystack.includes("abort")
  ) {
    return { failureKind: "timeout", statusCode };
  }

  if (
    haystack.includes("fetch failed")
    || haystack.includes("network")
    || haystack.includes("econnreset")
    || haystack.includes("econnrefused")
    || haystack.includes("enotfound")
    || haystack.includes("socket hang up")
    || haystack.includes("connection error")
  ) {
    return { failureKind: "network_error", statusCode };
  }

  return { failureKind: "unknown", statusCode };
}

export function extractReplyFromChatCompletion(completion: unknown): CompletionReply {
  if (!completion || typeof completion !== "object") {
    return { ok: false, failureKind: "invalid_response" };
  }

  const choices = (completion as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { ok: false, failureKind: "invalid_response" };
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    return { ok: false, failureKind: "invalid_response" };
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return { ok: false, failureKind: "invalid_response" };
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string") {
    return { ok: false, failureKind: "invalid_response" };
  }

  const reply = content.trim();
  if (!reply) {
    return { ok: false, failureKind: "empty_response" };
  }

  return { ok: true, reply };
}

export function buildLlmFallbackLog(input: {
  requestId: string;
  route: LlmRouteName;
  failureKind: LlmFailureKind;
  statusCode?: number | null;
  durationMs: number;
  hasClient: boolean;
}): SafeLlmFallbackLog {
  return {
    requestId: input.requestId,
    route: input.route,
    provider: getLlmProvider(),
    model: getLlmModel(),
    failureKind: input.failureKind,
    statusCode: input.statusCode ?? null,
    durationMs: input.durationMs,
    hasApiKey: Boolean(getLlmApiKey()),
    hasClient: input.hasClient,
  };
}

export function logLlmFallback(log: SafeLlmFallbackLog): void {
  console.warn(`[${log.route}] LLM fallback`, log);
}
