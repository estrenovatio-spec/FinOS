/** Read preview DB URL from env (Vercel names are case-sensitive). */
export function readPreviewDatabaseUrl(): string | undefined {
  const exact = process.env.DATABASE_URL_PREVIEW?.trim();
  if (exact) return exact;

  for (const [key, value] of Object.entries(process.env)) {
    if (key.toUpperCase() === "DATABASE_URL_PREVIEW" && value?.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function readDatabaseUrlEnvFlags(): {
  DATABASE_URL: boolean;
  DATABASE_URL_PREVIEW: boolean;
  DATABASE_URL_preview: boolean;
  resolved: boolean;
} {
  const main = Boolean(process.env.DATABASE_URL?.trim());
  const previewExact = Boolean(process.env.DATABASE_URL_PREVIEW?.trim());
  let previewLower = false;
  for (const key of Object.keys(process.env)) {
    if (key === "DATABASE_URL_preview" && process.env[key]?.trim()) {
      previewLower = true;
      break;
    }
  }
  return {
    DATABASE_URL: main,
    DATABASE_URL_PREVIEW: previewExact,
    DATABASE_URL_preview: previewLower,
    resolved: Boolean(getDatabaseUrlFromEnv()),
  };
}

export function getDatabaseUrlFromEnv(): string | undefined {
  const main = process.env.DATABASE_URL?.trim();
  const preview = readPreviewDatabaseUrl();
  if (process.env.VERCEL_ENV === "preview" && preview) return preview;
  return main || preview || undefined;
}
