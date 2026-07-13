import type Mail from "nodemailer/lib/mailer";

export type EmailProvider = "gmail_smtp" | "resend";

export class EmailSenderError extends Error {
  constructor(message: "provider_unavailable" | "send_failed") {
    super(message);
  }
}

type SendOtpEmailParams = {
  email: string;
  code: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

type TransportLike = {
  sendMail(message: Mail.Options): Promise<unknown>;
};

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function authEmailFrom(): string | null {
  return readEnv("AUTH_EMAIL_FROM");
}

function resendApiKey(): string | null {
  return readEnv("RESEND_API_KEY");
}

function smtpConfig(): SmtpConfig | null {
  const host = readEnv("SMTP_HOST");
  const portRaw = readEnv("SMTP_PORT");
  const secureRaw = readEnv("SMTP_SECURE");
  const user = readEnv("SMTP_USER");
  const pass = readEnv("SMTP_PASS");

  if (!host || !portRaw || !user || !pass) return null;

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) return null;

  const secure =
    secureRaw == null
      ? port === 465
      : secureRaw === "true" || secureRaw === "1" || secureRaw.toLowerCase() === "yes";

  return { host, port, secure, user, pass };
}

let testTransportFactory:
  | ((config: SmtpConfig) => Promise<TransportLike> | TransportLike)
  | null = null;

export function setSmtpTransportFactoryForTests(
  factory: ((config: SmtpConfig) => Promise<TransportLike> | TransportLike) | null,
) {
  testTransportFactory = factory;
}

export function getEmailProvider(): EmailProvider | null {
  const explicit = readEnv("EMAIL_PROVIDER");
  if (explicit === "gmail_smtp" || explicit === "resend") {
    return explicit;
  }
  if (smtpConfig()) return "gmail_smtp";
  if (resendApiKey()) return "resend";
  return null;
}

export function buildOtpEmailMessage(params: SendOtpEmailParams): Mail.Options {
  const from = authEmailFrom();
  if (!from) {
    throw new EmailSenderError("provider_unavailable");
  }

  return {
    from,
    to: params.email,
    subject: "Код для входа в FIN OS",
    text: `Ваш код для входа в FIN OS:\n\n${params.code}\n\nКод действует 10 минут.\n\nЕсли вы не запрашивали вход, просто проигнорируйте письмо.`,
  };
}

async function createSmtpTransport(config: SmtpConfig): Promise<TransportLike> {
  if (testTransportFactory) {
    return await testTransportFactory(config);
  }

  const nodemailer = await import("nodemailer");
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export async function sendOtpEmailViaSmtp(params: SendOtpEmailParams): Promise<void> {
  const config = smtpConfig();
  if (!config) {
    throw new EmailSenderError("provider_unavailable");
  }

  const transport = await createSmtpTransport(config);
  const message = buildOtpEmailMessage(params);

  try {
    await transport.sendMail(message);
  } catch {
    throw new EmailSenderError("send_failed");
  }
}

export async function sendOtpEmailViaResend(params: SendOtpEmailParams): Promise<void> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    throw new EmailSenderError("provider_unavailable");
  }

  const message = buildOtpEmailMessage(params);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: message.from,
      to: [params.email],
      subject: message.subject,
      text: message.text,
    }),
  });

  if (!response.ok) {
    throw new EmailSenderError("send_failed");
  }
}

export async function sendOtpEmail(params: SendOtpEmailParams): Promise<void> {
  const provider = getEmailProvider();
  if (provider === "gmail_smtp") {
    await sendOtpEmailViaSmtp(params);
    return;
  }
  if (provider === "resend") {
    await sendOtpEmailViaResend(params);
    return;
  }
  throw new EmailSenderError("provider_unavailable");
}
