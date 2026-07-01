const DEFAULT_RETRY_STATUSES = new Set([502, 503, 504]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isRetryableHttpStatus(status: number): boolean {
  return DEFAULT_RETRY_STATUSES.has(status);
}

export function isTransientHttpError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg === "http_502" ||
    msg === "http_503" ||
    msg === "http_504" ||
    /failed to fetch|networkerror|load failed/i.test(msg)
  );
}

/** Повтор при кратковременных сбоях (деплой, cold start) — пользователь не видит ошибку. */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<Response> {
  const retries = opts?.retries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 600;

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      lastResponse = res;
      if (res.ok || !isRetryableHttpStatus(res.status) || attempt === retries) {
        return res;
      }
    } catch (err) {
      if (attempt === retries) throw err;
    }

    await wait(baseDelayMs * (attempt + 1));
  }

  return lastResponse ?? fetch(input, init);
}
