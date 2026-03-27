import { NextRequest, NextResponse } from "next/server";
import { runFfmpegRuntimeCheck } from "@/lib/audio/ffmpeg-runtime-check";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_DIAGNOSTICS_TOKEN?.trim();
  if (!expected) {
    return false;
  }
  const provided =
    request.headers.get("x-internal-token")?.trim() ??
    request.nextUrl.searchParams.get("token")?.trim() ??
    "";
  return provided === expected;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    // Return 404 to avoid advertising internal diagnostics endpoints.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const check = await runFfmpegRuntimeCheck();
    return NextResponse.json(
      {
        ok: check.versionCommandOk,
        ffmpeg: check,
        runtime: {
          node: process.version,
          platform: process.platform,
          netlify: process.env.NETLIFY === "true"
        }
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown ffmpeg runtime check error.";
    return NextResponse.json(
      {
        ok: false,
        error: detail
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
