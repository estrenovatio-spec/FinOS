import { DEFAULT_DIAGNOSTICS_FORM_URL } from "@/data/diagnostics-form-default";
import { DEFAULT_EDUCATION_VIDEOS } from "@/data/education-videos-default";
import { parseEducationVideosJson } from "@/lib/education-videos-parse";

export type EducationVideoLink = {
  title: string;
  url: string;
  description?: string;
};

export function getEducationVideos(): EducationVideoLink[] {
  const fromEnv = parseEducationVideosJson(process.env.NEXT_PUBLIC_EDUCATION_VIDEOS_JSON);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_EDUCATION_VIDEOS;
}

export function getDiagnosticsFormUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_DIAGNOSTICS_FORM_URL?.trim() ||
    process.env.NEXT_PUBLIC_DIAGNOSTICS_FORM_URL_PREVIEW?.trim() ||
    DEFAULT_DIAGNOSTICS_FORM_URL;
  if (!url?.startsWith("http")) return null;
  return url;
}

export function openExternalAppLink(url: string): void {
  if (typeof window === "undefined") return;
  const normalized = url.trim();
  if (!normalized.startsWith("http")) return;

  const tg = window.Telegram?.WebApp;
  try {
    if (tg?.openLink) {
      tg.openLink(normalized, { try_instant_view: false });
      return;
    }
  } catch {
    /* fallback */
  }
  window.open(normalized, "_blank", "noopener,noreferrer");
}
