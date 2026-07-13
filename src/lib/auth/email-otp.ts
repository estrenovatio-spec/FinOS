import { createHash, randomInt } from "crypto";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

function otpSecret(): string {
  return (
    process.env.AUTH_EMAIL_OTP_SECRET?.trim() ||
    process.env.HOUSEHOLD_SESSION_SECRET?.trim() ||
    process.env.RATE_LIMIT_SECRET?.trim() ||
    "dev-email-otp-secret-change-me"
  );
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function maskEmail(email: string): string {
  const [local, domain] = normalizeEmail(email).split("@");
  if (!local || !domain) return "***";
  const visibleLocal = local.length <= 2 ? local[0] ?? "*" : `${local[0]}${"*".repeat(Math.max(1, local.length - 2))}${local.slice(-1)}`;
  const [domainName, ...domainTail] = domain.split(".");
  const visibleDomain =
    domainName.length <= 2
      ? `${domainName[0] ?? "*"}*`
      : `${domainName.slice(0, 2)}${"*".repeat(Math.max(1, domainName.length - 2))}`;
  return `${visibleLocal}@${[visibleDomain, ...domainTail].join(".")}`;
}

export function generateEmailOtpCode(): string {
  return `${randomInt(0, 1_000_000)}`.padStart(6, "0");
}

export function hashEmailOtp(email: string, code: string): string {
  return createHash("sha256")
    .update(`${normalizeEmail(email)}:${code}:${otpSecret()}`)
    .digest("hex");
}

export function hashRateLimitValue(value: string): string {
  return createHash("sha256")
    .update(`${value}:${otpSecret()}`)
    .digest("hex");
}

export function emailOtpExpiryDate(now = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
}

export function getEmailOtpTtlMinutes(): number {
  return OTP_TTL_MINUTES;
}

export function getEmailOtpMaxAttempts(): number {
  return OTP_MAX_ATTEMPTS;
}

export function getEmailOtpResendCooldownSeconds(): number {
  return OTP_RESEND_COOLDOWN_SECONDS;
}
