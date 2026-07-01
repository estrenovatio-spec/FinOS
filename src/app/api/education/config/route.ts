import { NextResponse } from "next/server";
import { getEducationConfigFromEnv } from "@/lib/education-config-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getEducationConfigFromEnv();
  return NextResponse.json({
    ok: true,
    videos: config.videos,
    diagnosticsFormUrl: config.diagnosticsFormUrl,
    videosCount: config.videos.length,
    hasForm: Boolean(config.diagnosticsFormUrl),
  });
}
