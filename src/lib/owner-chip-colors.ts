/** Цвета кружков «кто потратил» в списке операций (локально в настройках). */

export const DEFAULT_MY_CHIP_COLOR = "#2563eb";
export const DEFAULT_PARTNER_CHIP_COLOR = "#7c3aed";

export const OWNER_CHIP_PRESETS = [
  "#2563eb",
  "#7c3aed",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#64748b",
  "#84cc16",
  "#f97316",
] as const;

export function sanitizeOwnerChipColor(
  value: string | null | undefined,
  fallback: string,
): string {
  const raw = value?.trim() ?? "";
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: Number.parseInt(m[1], 16),
    g: Number.parseInt(m[2], 16),
    b: Number.parseInt(m[3], 16),
  };
}

/** Контрастный цвет буквы на фоне кружка. */
export function ownerChipTextColor(bgHex: string): string {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return "#ffffff";
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.55 ? "#1e293b" : "#ffffff";
}

export function ownerChipStyle(bgHex: string): {
  backgroundColor: string;
  color: string;
} {
  const bg = sanitizeOwnerChipColor(bgHex, DEFAULT_MY_CHIP_COLOR);
  return { backgroundColor: bg, color: ownerChipTextColor(bg) };
}
