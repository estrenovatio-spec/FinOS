import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestEmailOtp, EmailOtpError } from "@/lib/auth/email-otp-service";

const bodySchema = z.object({
  email: z.string().min(3).max(320),
});

function requestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await requestEmailOtp({
      email: body.email,
      ip: requestIp(req),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof EmailOtpError)) {
      console.error("[auth/email/request]", error);
      return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });
    }
    if (error.message === "rate_limited") {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error.message === "cooldown_active") {
      return NextResponse.json(
        { error: error.message, cooldownSeconds: 60 },
        { status: 429 },
      );
    }
    if (error.message === "invalid_email") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}
