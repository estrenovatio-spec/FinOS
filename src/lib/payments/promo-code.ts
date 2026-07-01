/** Normalize promo code for lookup (case-insensitive, collapsed spaces). */
export function normalizePromoCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export type PromoRedeemErrorCode =
  | "invalid_promo_code"
  | "promo_not_found"
  | "promo_not_yet_valid"
  | "promo_expired"
  | "promo_exhausted"
  | "promo_already_used"
  | "payments_not_enforced";

export class PromoRedeemFailed extends Error {
  constructor(public readonly code: PromoRedeemErrorCode) {
    super(code);
    this.name = "PromoRedeemFailed";
  }
}

export function isPromoRedeemError(error: unknown): error is PromoRedeemFailed {
  return error instanceof PromoRedeemFailed;
}
