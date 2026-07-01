import { hasPartnerDetectionConfig } from "@/lib/detect-owner";
import { t } from "@/lib/i18n";
import type { Locale } from "@/types";

/** Подпись строки «мои» операции / баланс — из настроек, иначе «Я». */
export function myDisplayName(locale: Locale, userName: string | null | undefined): string {
  const trimmed = userName?.trim();
  return trimmed || t(locale, "ownerMe");
}

/** Подпись операций партнёра — только из настроек на этом устройстве. */
export function partnerDisplayName(partnerName: string | null | undefined): string {
  return partnerName?.trim() ?? "";
}

export function hasPartnerBudget(
  partnerName: string | null | undefined,
  partnerKeywords?: readonly string[],
): boolean {
  return hasPartnerDetectionConfig(partnerName, partnerKeywords);
}

/** Подпись вкладки «партнёр», если имя не задано — «Партнёр». */
export function partnerTabLabel(
  locale: Locale,
  partnerName: string | null | undefined,
  partnerKeywords?: readonly string[],
): string {
  const name = partnerDisplayName(partnerName);
  if (name) return name;
  if (hasPartnerBudget(partnerName, partnerKeywords)) {
    return t(locale, "ownerPartner");
  }
  return "";
}

/** Имя в блоке баланса: 2 слова → 2 строки («любимая» / «красотка»). */
export function balanceNameLabelLines(name: string): string[] {
  const clean = name.trim();
  if (!clean) return [];

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }
  return [clean];
}

export function balanceNameLabelWithColon(lines: string[]): string[] {
  if (lines.length === 0) return [];
  if (lines.length === 1) return [`${lines[0]}:`];
  return [...lines.slice(0, -1), `${lines[lines.length - 1]}:`];
}
