import assert from "node:assert/strict";
import test from "node:test";
import {
  EmailSenderError,
  buildOtpEmailMessage,
  getEmailProvider,
  sendOtpEmailViaSmtp,
  setSmtpTransportFactoryForTests,
} from "@/lib/email-sender";

async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void> | void,
) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("smtp provider is selected when smtp env is configured", () =>
  withEnv(
    {
      EMAIL_PROVIDER: undefined,
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "beta@example.com",
      SMTP_PASS: "secret",
      RESEND_API_KEY: undefined,
    },
    () => {
      assert.equal(getEmailProvider(), "gmail_smtp");
    },
  ));

test("explicit resend provider still works when configured later", () =>
  withEnv(
    {
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test_key",
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "beta@example.com",
      SMTP_PASS: "secret",
    },
    () => {
      assert.equal(getEmailProvider(), "resend");
    },
  ));

test("missing smtp env keeps provider unavailable", () =>
  withEnv(
    {
      EMAIL_PROVIDER: "gmail_smtp",
      SMTP_HOST: undefined,
      SMTP_PORT: undefined,
      SMTP_SECURE: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      RESEND_API_KEY: undefined,
      AUTH_EMAIL_FROM: "FIN OS <login@example.com>",
    },
    async () => {
      await assert.rejects(
        () => sendOtpEmailViaSmtp({ email: "alexey@example.com", code: "123456" }),
        (error: unknown) =>
          error instanceof EmailSenderError && error.message === "provider_unavailable",
      );
    },
  ));

test("otp email body is human-readable and contains no technical details", () =>
  withEnv(
    {
      AUTH_EMAIL_FROM: "FIN OS <login@example.com>",
    },
    () => {
      const message = buildOtpEmailMessage({
        email: "alexey@example.com",
        code: "123456",
      });
      const text = String(message.text ?? "");
      const subject = String(message.subject ?? "");

      assert.equal(subject, "Код для входа в FIN OS");
      assert.match(text, /123456/);
      assert.match(text, /Код действует 10 минут/);
      assert.doesNotMatch(text, /session/i);
      assert.doesNotMatch(text, /telegram/i);
    },
  ));

test("smtp sender passes the target email to the configured transport", async (t) => {
  const sent: Array<{ to: string; subject: string; text: string }> = [];

  setSmtpTransportFactoryForTests((config) => {
    assert.deepEqual(config, {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: "beta@example.com",
      pass: "secret",
    });

    return {
      sendMail: async (message) => {
        sent.push({
          to: String(message.to ?? ""),
          subject: String(message.subject ?? ""),
          text: String(message.text ?? ""),
        });
      },
    };
  });

  t.after(() => {
    setSmtpTransportFactoryForTests(null);
  });

  await withEnv(
    {
      EMAIL_PROVIDER: "gmail_smtp",
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "beta@example.com",
      SMTP_PASS: "secret",
      AUTH_EMAIL_FROM: "FIN OS <login@example.com>",
    },
    async () => {
      await sendOtpEmailViaSmtp({ email: "alexey@example.com", code: "123456" });
    },
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, "alexey@example.com");
  assert.equal(sent[0]?.subject, "Код для входа в FIN OS");
  assert.match(sent[0]?.text ?? "", /123456/);
});

test("smtp transport errors become controlled provider errors", async (t) => {
  setSmtpTransportFactoryForTests(() => ({
    sendMail: async () => {
      throw new Error("smtp failed");
    },
  }));

  t.after(() => {
    setSmtpTransportFactoryForTests(null);
  });

  await withEnv(
    {
      EMAIL_PROVIDER: "gmail_smtp",
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "beta@example.com",
      SMTP_PASS: "secret",
      AUTH_EMAIL_FROM: "FIN OS <login@example.com>",
    },
    async () => {
      await assert.rejects(
        () => sendOtpEmailViaSmtp({ email: "alexey@example.com", code: "123456" }),
        (error: unknown) => error instanceof EmailSenderError && error.message === "send_failed",
      );
    },
  );
});
