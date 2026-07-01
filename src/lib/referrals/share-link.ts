/** Open Telegram share dialog for referral link (Mini App). */
export function shareReferralLink(link: string, text: string): void {
  if (typeof window === "undefined") return;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  const tg = window.Telegram?.WebApp;
  try {
    if (tg?.openLink) {
      tg.openLink(shareUrl, { try_instant_view: false });
      return;
    }
  } catch {
    /* fallback */
  }
  window.open(shareUrl, "_blank", "noopener,noreferrer");
}
