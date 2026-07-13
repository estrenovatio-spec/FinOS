import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setHouseholdSessionCookie } from "@/lib/auth/session-cookie";
import { EmailOtpError, verifyEmailOtp } from "@/lib/auth/email-otp-service";
import { requireSession } from "@/lib/api/household-auth";
import { signHouseholdSession } from "@/lib/household/token";

const bodySchema = z.object({
  email: z.string().min(3).max(320),
  code: z.string().min(6).max(6),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const session = requireSession(req);
    const result = await verifyEmailOtp({
      email: body.email,
      code: body.code,
      currentUserId: session?.userId ?? null,
    });
    const token = signHouseholdSession({
      userId: result.user.id,
      householdId: result.household.id,
    });
    const response = NextResponse.json({
      ok: true,
      user: {
        id: result.user.id,
        firstName: result.user.firstName,
        email: result.user.email,
        authMethod: "email",
      },
      household: result.household,
      token,
      sync: result.sync,
    });
    setHouseholdSessionCookie(response, token);
    return response;
  } catch (error) {
    if (!(error instanceof EmailOtpError)) {
      console.error("[auth/email/verify]", error);
      return NextResponse.json({ error: "otp_invalid" }, { status: 400 });
    }
    const status =
      error.message === "email_already_linked"
        ? 409
        : error.message === "otp_expired" ||
            error.message === "otp_attempts_exceeded" ||
            error.message === "otp_invalid"
          ? 400
          : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
