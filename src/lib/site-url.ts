import { envString } from "@/lib/payments/env-flags";

const DEFAULT_SITE_URL = "https://voicebudget.vercel.app";

function vercelEnv(): string | undefined {
  return process.env.VERCEL_ENV?.trim();
}

function isPreviewDeploy(): boolean {
  return vercelEnv() === "preview";
}

/**
 * Public site URL for webhooks, YooKassa return, status, sheets.
 * Preview: NEXT_PUBLIC_SITE_URL_PREVIEW (then fallback NEXT_PUBLIC_SITE_URL).
 * Production: NEXT_PUBLIC_SITE_URL.
 */
export function getPublicSiteUrl(): string {
  const preview = envString("NEXT_PUBLIC_SITE_URL_PREVIEW");
  const prod = envString("NEXT_PUBLIC_SITE_URL");
  let raw = isPreviewDeploy() ? preview || prod : prod || preview;

  if (!raw && isPreviewDeploy()) {
    const vercelHost = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//, "");
    if (vercelHost) raw = `https://${vercelHost}`;
  }

  return (raw || DEFAULT_SITE_URL).replace(/\/$/, "");
}
