import { NextResponse } from "next/server";

export function dbUnavailable() {
  return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
}

export function badRequest(message = "bad_request") {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export function conflict(code: string) {
  return NextResponse.json({ error: code }, { status: 409 });
}

export function subscriptionRequired() {
  return NextResponse.json({ error: "subscription_required" }, { status: 402 });
}

/** Map common household guard errors to HTTP responses. */
export function mapCloudGuardError(e: unknown): ReturnType<typeof forbidden> | ReturnType<typeof subscriptionRequired> | null {
  if (e instanceof Error && e.message === "forbidden") return forbidden();
  if (e instanceof Error && e.message === "subscription_required") return subscriptionRequired();
  return null;
}
