import assert from "node:assert/strict";
import test from "node:test";
import {
  emailOtpExpiryDate,
  generateEmailOtpCode,
  getEmailOtpMaxAttempts,
  getEmailOtpResendCooldownSeconds,
  getEmailOtpTtlMinutes,
  hashEmailOtp,
  maskEmail,
  normalizeEmail,
} from "@/lib/auth/email-otp";

test("email normalization trims and lowercases", () => {
  assert.equal(normalizeEmail("  AlexEY@Example.COM "), "alexey@example.com");
});

test("generated otp is six digits", () => {
  const code = generateEmailOtpCode();
  assert.match(code, /^\d{6}$/);
});

test("otp hash does not expose the original code", () => {
  const hash = hashEmailOtp("alexey@example.com", "123456");
  assert.notEqual(hash, "123456");
  assert.equal(hash.length, 64);
});

test("same email and code produce the same hash, different code changes it", () => {
  const first = hashEmailOtp("alexey@example.com", "123456");
  const second = hashEmailOtp("alexey@example.com", "123456");
  const third = hashEmailOtp("alexey@example.com", "654321");
  assert.equal(first, second);
  assert.notEqual(first, third);
});

test("otp expiry uses a ten minute ttl", () => {
  const start = new Date("2026-07-13T10:00:00.000Z");
  const expiry = emailOtpExpiryDate(start);
  assert.equal(expiry.toISOString(), "2026-07-13T10:10:00.000Z");
  assert.equal(getEmailOtpTtlMinutes(), 10);
});

test("otp limits are explicit", () => {
  assert.equal(getEmailOtpMaxAttempts(), 5);
  assert.equal(getEmailOtpResendCooldownSeconds(), 60);
});

test("masked email keeps structure without exposing the full address", () => {
  const masked = maskEmail("alexey@example.com");
  assert.match(masked, /^a.+y@ex.+\.com$/);
  assert.notEqual(masked, "alexey@example.com");
});
