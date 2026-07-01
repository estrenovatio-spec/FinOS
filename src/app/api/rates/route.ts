import { NextResponse } from "next/server";
import { getMarketRates } from "@/lib/market-rates";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rates = await getMarketRates();
    return NextResponse.json({ success: true, rates });
  } catch (err) {
    console.error("[api/rates]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "rates_unavailable" }, { status: 502 });
  }
}
