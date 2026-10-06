import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedAccount } from "@/lib/auth/require-user";
import { createGeneratedSongSignedUrl } from "@/lib/music-generation/storage";
import { getProjectForUser, getProjectGenerationForUser } from "@/lib/projects/store";

export const dynamic = "force-dynamic";

function metadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; generationId: string } }
) {
  const account = await requireAuthenticatedAccount(request);
  if (!account) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const project = await getProjectForUser(account.user.id, params.projectId);
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const generation = await getProjectGenerationForUser(
    account.user.id,
    project.id,
    params.generationId
  );
  if (!generation) {
    return NextResponse.json({ error: "generation_not_found" }, { status: 404 });
  }

  const bucket = metadataString(generation.metadata, "storageBucket");
  const path = metadataString(generation.metadata, "storagePath");
  if (!bucket || !path || generation.source !== "lyria") {
    return NextResponse.json({ error: "generated_audio_not_found" }, { status: 404 });
  }

  try {
    const signedUrl = await createGeneratedSongSignedUrl({ bucket, path, expiresInSeconds: 600 });
    return NextResponse.redirect(signedUrl, 307);
  } catch (error) {
    console.error("[music-generation] signed_audio_failed", {
      projectId: project.id,
      generationId: generation.id,
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: "generated_audio_unavailable" }, { status: 503 });
  }
}
