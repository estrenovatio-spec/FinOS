import assert from "node:assert/strict";
import test from "node:test";
import { EmailOtpError, requestEmailOtpWithDeps } from "@/lib/auth/email-otp-service";

function makeDeps() {
  const state = {
    recentForEmail: 0,
    recentForIp: 0,
    latestActive: null as { createdAt: Date } | null,
    consumed: 0,
    created: [] as Array<{ email: string; codeHash: string; ipHash: string | null; expiresAt: Date }>,
    sent: [] as Array<{ email: string; code: string }>,
  };

  return {
    state,
    deps: {
      countRecentForEmail: async () => state.recentForEmail,
      countRecentForIp: async () => state.recentForIp,
      findLatestForCooldown: async () => state.latestActive,
      consumeActiveOtps: async () => {
        state.consumed += 1;
      },
      createOtp: async (params: {
        email: string;
        codeHash: string;
        ipHash: string | null;
        expiresAt: Date;
      }) => {
        state.created.push(params);
      },
      sendEmail: async (params: { email: string; code: string }) => {
        state.sent.push(params);
      },
    },
  };
}

test("failed delivery does not create otp row or start cooldown state", async () => {
  const { state, deps } = makeDeps();
  deps.sendEmail = async () => {
    throw new EmailOtpError("provider_unavailable");
  };

  await assert.rejects(
    () =>
      requestEmailOtpWithDeps(
        {
          email: "alexey@example.com",
          ip: "127.0.0.1",
        },
        deps,
      ),
    (error: unknown) => error instanceof EmailOtpError && error.message === "provider_unavailable",
  );

  assert.equal(state.sent.length, 0);
  assert.equal(state.created.length, 0);
  assert.equal(state.consumed, 0);
});

test("successful delivery creates otp row and enables cooldown", async () => {
  const { state, deps } = makeDeps();
  const result = await requestEmailOtpWithDeps(
    {
      email: "alexey@example.com",
      ip: "127.0.0.1",
    },
    deps,
  );

  assert.equal(result.ok, true);
  assert.equal(result.cooldownSeconds, 60);
  assert.equal(state.sent.length, 1);
  assert.equal(state.created.length, 1);
  assert.equal(state.consumed, 1);
  assert.notEqual(state.created[0]?.codeHash, state.sent[0]?.code);
});

test("cooldown still blocks repeated request after a successful send", async () => {
  const { deps } = makeDeps();
  deps.findLatestForCooldown = async () => ({ createdAt: new Date() });

  await assert.rejects(
    () =>
      requestEmailOtpWithDeps(
        {
          email: "alexey@example.com",
          ip: "127.0.0.1",
        },
        deps,
      ),
    (error: unknown) => error instanceof EmailOtpError && error.message === "cooldown_active",
  );
});
