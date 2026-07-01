/** User pasted a referral link/code into household join — not a family invite code. */
export function looksLikeReferralInviteInput(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/t\.me\//i.test(s) || /telegram\.me\//i.test(s)) return true;
  if (/startapp=/i.test(s) || /start=/i.test(s)) return true;
  if (/^ref[_-]/i.test(s)) return true;
  return false;
}
