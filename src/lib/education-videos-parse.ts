import type { EducationVideoLink } from "@/lib/education-links";

function normalizeUrl(url: string): string {
  let u = url.trim();
  if (!u) return "";
  if (!u.startsWith("http")) {
    if (u.startsWith("//")) u = `https:${u}`;
    else u = `https://${u}`;
  }
  return u.startsWith("http") ? u : "";
}

function pushRow(
  items: EducationVideoLink[],
  title: string,
  url: string,
  description?: string,
): void {
  const t = title.trim();
  const u = normalizeUrl(url);
  if (!t || !u) return;
  items.push({
    title: t,
    url: u,
    description: description?.trim() || undefined,
  });
}

/** Строки вида "title":"…","url":"…" без массива JSON. */
function parseLooseTitleUrlLines(raw: string): EducationVideoLink[] {
  const items: EducationVideoLink[] = [];
  const re =
    /"title"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"url"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const title = m[1].replace(/\\"/g, '"');
    const url = m[2].replace(/\\"/g, '"');
    pushRow(items, title, url);
  }
  return items;
}

export function parseEducationVideosJson(raw: string | undefined): EducationVideoLink[] {
  if (!raw?.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const items: EducationVideoLink[] = [];
      for (const row of parsed) {
        if (!row || typeof row !== "object") continue;
        const o = row as Record<string, unknown>;
        pushRow(
          items,
          typeof o.title === "string" ? o.title : "",
          typeof o.url === "string" ? o.url : "",
          typeof o.description === "string" ? o.description : undefined,
        );
      }
      if (items.length > 0) return items;
    }
  } catch {
    /* try loose */
  }

  return parseLooseTitleUrlLines(raw);
}
