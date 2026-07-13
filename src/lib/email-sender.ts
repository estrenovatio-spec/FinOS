import type Mail from "nodemailer/lib/mailer";

export type EmailProvider = "gmail_smtp" | "resend";
export type EmailFailureKind =
  | "provider_not_configured"
  | "smtp_auth_failed"
  | "smtp_connection_failed"
  | "smtp_tls_failed"
  | "smtp_sender_rejected"
  | "smtp_recipient_rejected"
  | "smtp_timeout"
  | "smtp_rate_limited"
  | "smtp_unknown";

export class EmailSenderError extends Error {
  kind: EmailFailureKind;
  provider: EmailProvider | null;
  responseCode: string | number | null;
  diagnostics: {
    failureKind: EmailFailureKind;
    host: string | null;
    port: number | null;
    secure: boolean | null;
    hasUser: boolean;
    hasPassword: boolean;
  };

  constructor(
    message: "provider_unavailable" | "send_failed",
    options?: {
      kind?: EmailFailureKind;
      provider?: EmailProvider | null;
      responseCode?: string | number | null;
      diagnostics?: Partial<EmailSenderError["diagnostics"]>;
    },
  ) {
    super(message);
    this.kind = options?.kind ?? "smtp_unknown";
    this.provider = options?.provider ?? null;
    this.responseCode = options?.responseCode ?? null;
    this.diagnostics = {
      failureKind: this.kind,
      host: options?.diagnostics?.host ?? null,
      port: options?.diagnostics?.port ?? null,
      secure: options?.diagnostics?.secure ?? null,
      hasUser: options?.diagnostics?.hasUser ?? false,
      hasPassword: options?.diagnostics?.hasPassword ?? false,
    };
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
  verify?(): Promise<unknown>;
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
  const passRaw = readEnv("SMTP_PASS");
  const pass = passRaw ? passRaw.replace(/\s+/g, "") : null;

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

function classifySmtpFailure(error: unknown): {
  kind: EmailFailureKind;
  responseCode: string | number | null;
} {
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const command =
    typeof error === "object" && error && "command" in error
      ? String((error as { command?: unknown }).command ?? "")
      : "";
  const responseCode =
    typeof error === "object" && error && "responseCode" in error
      ? ((error as { responseCode?: string | number }).responseCode ?? null)
      : null;

  if (code === "EAUTH") return { kind: "smtp_auth_failed", responseCode };
  if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNECTION") {
    return { kind: "smtp_timeout", responseCode };
  }
  if (code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ENOTFOUND") {
    return { kind: "smtp_connection_failed", responseCode };
  }
  if (code === "ESOCKET" && command.toUpperCase() === "CONN") {
    return { kind: "smtp_tls_failed", responseCode };
  }
  if (responseCode === 421 || responseCode === 450 || responseCode === 451 || responseCode === 452) {
    return { kind: "smtp_rate_limited", responseCode };
  }
  if (responseCode === 530 || responseCode === 550 || responseCode === 553) {
    return { kind: "smtp_sender_rejected", responseCode };
  }
  if (responseCode === 550 || responseCode === 551 || responseCode === 552 || responseCode === 554) {
    return { kind: "smtp_recipient_rejected", responseCode };
  }
  return { kind: "smtp_unknown", responseCode };
}

export async function sendOtpEmailViaSmtp(params: SendOtpEmailParams): Promise<void> {
  const config = smtpConfig();
  if (!config) {
    throw new EmailSenderError("provider_unavailable", {
      kind: "provider_not_configured",
      provider: "gmail_smtp",
      diagnostics: {
        host: null,
        port: null,
        secure: null,
        hasUser: false,
        hasPassword: false,
      },
    });
  }

  const transport = await createSmtpTransport(config);
  const message = buildOtpEmailMessage(params);

  try {
    if (typeof transport.verify === "function") {
      await transport.verify();
    }
    await transport.sendMail(message);
  } catch (error) {
    const failure = classifySmtpFailure(error);
    throw new EmailSenderError("send_failed", {
      kind: failure.kind,
      provider: "gmail_smtp",
      responseCode: failure.responseCode,
      diagnostics: {
        host: config.host,
        port: config.port,
        secure: config.secure,
        hasUser: Boolean(config.user),
        hasPassword: Boolean(config.pass),
      },
    });
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
