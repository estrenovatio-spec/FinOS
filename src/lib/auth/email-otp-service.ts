import { prisma } from "@/lib/db";
import { EmailSenderError, sendOtpEmail } from "@/lib/email-sender";
import { createHousehold, getHouseholdSessionForUser } from "@/lib/household/service";
import {
  emailOtpExpiryDate,
  generateEmailOtpCode,
  getEmailOtpMaxAttempts,
  getEmailOtpResendCooldownSeconds,
  hashEmailOtp,
  hashRateLimitValue,
  maskEmail,
  normalizeEmail,
} from "@/lib/auth/email-otp";

const EMAIL_REQUEST_LIMIT_PER_HOUR = 5;
const IP_REQUEST_LIMIT_PER_15_MIN = 10;
const IP_WINDOW_MINUTES = 15;
const EMAIL_REQUEST_WINDOW_MINUTES = 60;

type EmailOtpRequestDeps = {
  countRecentForEmail: (email: string, from: Date) => Promise<number>;
  countRecentForIp: (ipHash: string | null, from: Date) => Promise<number>;
  findLatestForCooldown: (email: string, from: Date) => Promise<{ createdAt: Date } | null>;
  consumeActiveOtps: (email: string, now: Date) => Promise<void>;
  createOtp: (params: {
    email: string;
    codeHash: string;
    ipHash: string | null;
    expiresAt: Date;
  }) => Promise<void>;
  sendEmail: (params: { email: string; code: string }) => Promise<void>;
};

type EnsureEmailUserOptions = {
  currentUserId?: string | null;
};

export class EmailOtpError extends Error {
  constructor(
    message:
      | "invalid_email"
      | "rate_limited"
      | "cooldown_active"
      | "provider_unavailable"
      | "otp_invalid"
      | "otp_expired"
      | "otp_attempts_exceeded"
      | "email_already_linked",
  ) {
    super(message);
  }
}

function isEmailLike(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function sendEmailOtpCode(params: {
  email: string;
  code: string;
}): Promise<void> {
  try {
    await sendOtpEmail(params);
  } catch (error) {
    if (error instanceof EmailSenderError) {
      console.error("[auth/email/request] delivery_failed", {
        provider: error.provider,
        failureKind: error.kind,
        responseCode: error.responseCode,
        host: error.diagnostics.host,
        port: error.diagnostics.port,
        secure: error.diagnostics.secure,
        hasUser: error.diagnostics.hasUser,
        hasPassword: error.diagnostics.hasPassword,
      });
      throw new EmailOtpError("provider_unavailable");
    }
    throw new EmailOtpError("provider_unavailable");
  }
}

function defaultEmailOtpRequestDeps(): EmailOtpRequestDeps {
  return {
    countRecentForEmail: (email, from) =>
      prisma.emailOtp.count({
        where: {
          email,
          createdAt: { gte: from },
        },
      }),
    countRecentForIp: (ipHash, from) =>
      ipHash
        ? prisma.emailOtp.count({
            where: {
              requestedIpHash: ipHash,
              createdAt: { gte: from },
            },
          })
        : Promise.resolve(0),
    findLatestForCooldown: (email, from) =>
      prisma.emailOtp.findFirst({
        where: {
          email,
          createdAt: { gte: from },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    consumeActiveOtps: async (email, now) => {
      await prisma.emailOtp.updateMany({
        where: {
          email,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
    },
    createOtp: async ({ email, codeHash, ipHash, expiresAt }) => {
      await prisma.emailOtp.create({
        data: {
          email,
          codeHash,
          requestedIpHash: ipHash,
          expiresAt,
        },
      });
    },
    sendEmail: sendEmailOtpCode,
  };
}

export async function requestEmailOtpWithDeps(
  params: {
    email: string;
    ip?: string | null;
  },
  deps: EmailOtpRequestDeps,
): Promise<{ ok: true; maskedEmail: string; cooldownSeconds: number }> {
  const email = normalizeEmail(params.email);
  if (!isEmailLike(email)) {
    throw new EmailOtpError("invalid_email");
  }

  const now = new Date();
  const ipHash = params.ip ? hashRateLimitValue(params.ip) : null;
  const emailWindow = new Date(now.getTime() - EMAIL_REQUEST_WINDOW_MINUTES * 60 * 1000);
  const ipWindow = new Date(now.getTime() - IP_WINDOW_MINUTES * 60 * 1000);
  const cooldownEdge = new Date(now.getTime() - getEmailOtpResendCooldownSeconds() * 1000);

  const [recentForEmail, recentForIp, lastActive] = await Promise.all([
    deps.countRecentForEmail(email, emailWindow),
    deps.countRecentForIp(ipHash, ipWindow),
    deps.findLatestForCooldown(email, cooldownEdge),
  ]);

  if (recentForEmail >= EMAIL_REQUEST_LIMIT_PER_HOUR || recentForIp >= IP_REQUEST_LIMIT_PER_15_MIN) {
    throw new EmailOtpError("rate_limited");
  }
  if (lastActive) {
    throw new EmailOtpError("cooldown_active");
  }

  const code = generateEmailOtpCode();
  const codeHash = hashEmailOtp(email, code);
  await deps.sendEmail({ email, code });
  await deps.consumeActiveOtps(email, now);
  await deps.createOtp({
    email,
    codeHash,
    ipHash,
    expiresAt: emailOtpExpiryDate(now),
  });

  return {
    ok: true,
    maskedEmail: maskEmail(email),
    cooldownSeconds: getEmailOtpResendCooldownSeconds(),
  };
}

export async function requestEmailOtp(params: {
  email: string;
  ip?: string | null;
}): Promise<{ ok: true; maskedEmail: string; cooldownSeconds: number }> {
  return requestEmailOtpWithDeps(params, defaultEmailOtpRequestDeps());
}

async function ensureEmailUser(
  email: string,
  options: EnsureEmailUserOptions,
): Promise<{ id: string; firstName: string | null; email: string | null }> {
  const currentUserId = options.currentUserId?.trim() || null;
  if (currentUserId) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingByEmail && existingByEmail.id !== currentUserId) {
      throw new EmailOtpError("email_already_linked");
    }
    return prisma.user.update({
      where: { id: currentUserId },
      data: {
        email,
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        firstName: true,
        email: true,
      },
    });
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      firstName: true,
      email: true,
    },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { emailVerifiedAt: new Date() },
      select: {
        id: true,
        firstName: true,
        email: true,
      },
    });
  }

  return prisma.user.create({
    data: {
      email,
      emailVerifiedAt: new Date(),
      firstName: null,
      username: null,
    },
    select: {
      id: true,
      firstName: true,
      email: true,
    },
  });
}

export async function verifyEmailOtp(params: {
  email: string;
  code: string;
  currentUserId?: string | null;
}): Promise<{
  user: { id: string; firstName: string | null; email: string | null };
  household: Awaited<ReturnType<typeof getHouseholdSessionForUser>> extends infer R
    ? R extends { household: infer H }
      ? H
      : never
    : never;
  sync: Awaited<ReturnType<typeof getHouseholdSessionForUser>> extends infer R
    ? R extends { sync: infer S }
      ? S
      : never
    : never;
}> {
  const email = normalizeEmail(params.email);
  const code = params.code.trim();
  if (!isEmailLike(email) || !/^\d{6}$/.test(code)) {
    throw new EmailOtpError("otp_invalid");
  }

  const now = new Date();
  const activeOtp = await prisma.emailOtp.findFirst({
    where: {
      email,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      codeHash: true,
      expiresAt: true,
      attempts: true,
    },
  });

  if (!activeOtp) {
    throw new EmailOtpError("otp_invalid");
  }
  if (activeOtp.expiresAt.getTime() <= now.getTime()) {
    await prisma.emailOtp.update({
      where: { id: activeOtp.id },
      data: { consumedAt: now },
    });
    throw new EmailOtpError("otp_expired");
  }
  if (activeOtp.attempts >= getEmailOtpMaxAttempts()) {
    throw new EmailOtpError("otp_attempts_exceeded");
  }

  const expectedHash = hashEmailOtp(email, code);
  if (expectedHash !== activeOtp.codeHash) {
    const updated = await prisma.emailOtp.update({
      where: { id: activeOtp.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (updated.attempts >= getEmailOtpMaxAttempts()) {
      throw new EmailOtpError("otp_attempts_exceeded");
    }
    throw new EmailOtpError("otp_invalid");
  }

  const user = await ensureEmailUser(email, {
    currentUserId: params.currentUserId,
  });

  await prisma.emailOtp.update({
    where: { id: activeOtp.id },
    data: {
      userId: user.id,
      consumedAt: now,
    },
  });

  let session = await getHouseholdSessionForUser(user.id);
  if (!session) {
    session = await createHousehold(user.id, {
      mode: "solo",
      name: "Мои финансы",
      partnerLabel: null,
    });
  }

  return {
    user,
    household: session.household,
    sync: session.sync,
  };
}
