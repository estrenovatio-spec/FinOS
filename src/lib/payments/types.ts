export interface SubscriptionPublic {
  active: boolean;
  status: "active" | "expired" | "canceled" | "none";
  expiresAt: string | null;
  enforced: boolean;
  priceRub: number;
  periodDays: number;
  trialDays: number;
  /** User never completed a payment — trial / promo access. */
  onFreeAccess: boolean;
  /** Show trial strip above header (server-computed). */
  showTrialBanner: boolean;
  /** Days until expiresAt (ceil), null if unknown. */
  daysRemaining: number | null;
  /** Billing UX test mode (no live charge required). */
  testMode: boolean;
  paymentsConfigured: boolean;
}

/** Free-access breakdown for header strip (trial + referral days). */
export interface AccessSummaryPublic {
  daysRemaining: number;
  expiresAt: string | null;
  trialDays: number;
  referralDaysForFriends: number;
  referralDaysFromInvite: number;
  referralDaysTotal: number;
  friendsInvited: number;
  wasInvited: boolean;
  referrerBonusPerFriend: number;
  referredBonusDays: number;
  referralPending?:
    | {
        role: "referred";
        waitsForSubscriptionPayment: true;
        bonusDays: number;
      }
    | {
        role: "referrer";
        waitsForFriendSubscriptionPayment: true;
        bonusDays: number;
      }
    | {
        role: "referred" | "referrer";
        daysRecorded: number;
        daysRequired: number;
        bonusDays: number;
      }
    | null;
  testMode: boolean;
}

export interface YookassaPaymentObject {
  id: string;
  status: string;
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
  created_at?: string;
  captured_at?: string;
}

export interface YookassaNotification {
  type: string;
  event: string;
  object: YookassaPaymentObject;
}
