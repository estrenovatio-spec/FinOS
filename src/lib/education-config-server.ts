import { DEFAULT_DIAGNOSTICS_FORM_URL } from "@/data/diagnostics-form-default";
import { DEFAULT_EDUCATION_VIDEOS } from "@/data/education-videos-default";
import type { EducationVideoLink } from "@/lib/education-links";
import { parseEducationVideosJson } from "@/lib/education-videos-parse";

function pickEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function getEducationConfigFromEnv(): {
  videos: EducationVideoLink[];
  diagnosticsFormUrl: string | null;
} {
  const videosRaw = pickEnv(
    "EDUCATION_VIDEOS_JSON",
    "NEXT_PUBLIC_EDUCATION_VIDEOS_JSON",
    "EDUCATION_VIDEOS_JSON_PREVIEW",
    "NEXT_PUBLIC_EDUCATION_VIDEOS_JSON_PREVIEW",
  );

  const formRaw = pickEnv(
    "DIAGNOSTICS_FORM_URL",
    "NEXT_PUBLIC_DIAGNOSTICS_FORM_URL",
    "DIAGNOSTICS_FORM_URL_PREVIEW",
    "NEXT_PUBLIC_DIAGNOSTICS_FORM_URL_PREVIEW",
  );

  let formUrl = formRaw ?? DEFAULT_DIAGNOSTICS_FORM_URL;
  if (!formUrl.startsWith("http")) {
    formUrl = formUrl.startsWith("//") ? `https:${formUrl}` : `https://${formUrl}`;
  }
  if (!formUrl.startsWith("http")) formUrl = DEFAULT_DIAGNOSTICS_FORM_URL;

  const fromEnv = parseEducationVideosJson(videosRaw);
  const videos = fromEnv.length > 0 ? fromEnv : DEFAULT_EDUCATION_VIDEOS;

  return {
    videos,
    diagnosticsFormUrl: formUrl,
  };
}
