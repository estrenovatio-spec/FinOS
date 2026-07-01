function envRaw(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

/** Match env key case-insensitively (e.g. SUBSCRIPTION_BILLING_TEST_preview). */
function envRawAny(...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = envRaw(key);
    if (v) return v;
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (!v?.trim()) continue;
    for (const key of keys) {
      if (k.toUpperCase() === key.toUpperCase()) return v.trim();
    }
  }
  return undefined;
}

export function envTruthy(...keys: string[]): boolean {
  const v = envRawAny(...keys);
  if (!v) return false;
  return v.toLowerCase() === "true" || v === "1";
}

export function envInt(...keys: string[]): number | undefined {
  const v = envRawAny(...keys);
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function envString(...keys: string[]): string | undefined {
  return envRawAny(...keys);
}
