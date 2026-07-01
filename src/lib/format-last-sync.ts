export function formatLastSync(iso: string | null, locale: "ru" | "en"): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}
