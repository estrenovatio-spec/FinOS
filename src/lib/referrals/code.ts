import { generateInviteCode } from "@/lib/household/invite-code";

/** User referral code (6–8 chars, no VB- prefix). */
export function generateReferralCode(length = 8): string {
  return generateInviteCode(length);
}

export function normalizeReferralCode(raw: string): string | null {
  let s = raw.trim().toUpperCase();
  if (!s) return null;

  const refMatch = s.match(/^REF[_-]?(.+)$/);
  if (refMatch) s = refMatch[1]!;

  const rMatch = s.match(/^R[_-]([A-Z0-9]{4,12})$/);
  if (rMatch) s = rMatch[1]!;

  s = s.replace(/^VB-?/i, "").replace(/[^A-Z0-9]/g, "");
  if (s.length < 4 || s.length > 12) return null;
  return s;
}

/** Parse Telegram Mini App start_param / bot ?start= payload. */
export function referralCodeFromStartParam(startParam: string | null | undefined): string | null {
  if (!startParam?.trim()) return null;
  const p = startParam.trim();
  if (/^join_/i.test(p)) return null;
  if (/^ref[_-]/i.test(p) || /^r[_-]/i.test(p)) {
    return normalizeReferralCode(p);
  }
  return normalizeReferralCode(p);
}

/** Pasted link, startapp=ref_… or raw code from «Ещё» / settings. */
export function parseReferralInviteInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const startApp = s.match(/startapp=([^&\s#]+)/i)?.[1];
  if (startApp) return referralCodeFromStartParam(decodeURIComponent(startApp));

  const start = s.match(/[?&]start=([^&\s#]+)/i)?.[1];
  if (start) return referralCodeFromStartParam(decodeURIComponent(start));

  return referralCodeFromStartParam(s);
}
