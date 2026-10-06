import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedAccount } from "@/lib/auth/require-user";
import { resolveNativeMusicGenerationAccess } from "@/lib/music-generation/access";
import { generateSongWithLyria, MusicGenerationProviderError } from "@/lib/music-generation/lyria";
import { storeGeneratedSongAudio } from "@/lib/music-generation/storage";
import {
  createProjectGeneration,
  getProjectForUser,
  listProjectArtifacts
} from "@/lib/projects/store";
import type { ProjectArtifact } from "@/lib/projects/types";

export const dynamic = "force-dynamic";

function latestArtifact(artifacts: ProjectArtifact[], kind: ProjectArtifact["kind"]): ProjectArtifact | null {
  let latest: ProjectArtifact | null = null;
  for (const artifact of artifacts) {
    if (artifact.kind !== kind) continue;
    if (!latest || artifact.version > latest.version) latest = artifact;
  }
  return latest;
}

function textField(payload: Record<string, unknown> | undefined, key: string): string {
  const value = payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function buildLyriaPrompt(input: {
  title: string;
  stylePrompt: string;
  sunoBlueprint: string;
  lyrics: string;
}): string {
  return [
    "Create a complete, release-ready song with vocals and a clear musical structure.",
    `Song title: ${input.title}`,
    "",
    "PRODUCTION BRIEF",
    input.stylePrompt,
    input.sunoBlueprint ? `\nARRANGEMENT / SECTION BLUEPRINT\n${input.sunoBlueprint}` : "",
    "",
    "LYRICS",
    "Preserve the supplied lyrics and their language as closely as possible. Do not add artist names or imitate a living artist.",
    input.lyrics,
    "",
    "Deliver a cohesive full song with an intro, developed sections, transitions, and a finished ending. Follow the production brief over generic genre defaults."
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 28_000);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const account = await requireAuthenticatedAccount(request);
  if (!account) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const project = await getProjectForUser(account.user.id, params.projectId);
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const access = await resolveNativeMusicGenerationAccess({
    userId: account.user.id,
    normalizedEmail: account.user.normalizedEmail
  });

  return NextResponse.json(
    {
      ok: true,
      planId: access.planId,
      eligible: access.eligible,
      configured: access.configured,
      usage: access.usage
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const account = await requireAuthenticatedAccount(request);
  if (!account) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const project = await getProjectForUser(account.user.id, params.projectId);
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const access = await resolveNativeMusicGenerationAccess({
    userId: account.user.id,
    normalizedEmail: account.user.normalizedEmail
  });

  if (access.planId !== "pro_studio_monthly") {
    return NextResponse.json(
      {
        ok: false,
        code: "pro_studio_required",
        message: "Generate inside MasterSauce is included with Pro Studio.",
        usage: access.usage
      },
      { status: 403 }
    );
  }
  if (access.usage.remaining <= 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "native_generation_quota_reached",
        message: "You have used all native song generations for this month.",
        usage: access.usage
      },
      { status: 403 }
    );
  }
  if (!access.configured) {
    return NextResponse.json(
      {
        ok: false,
        code: "native_generation_unavailable",
        message: "Native song generation is being configured. Export to Suno is still available."
      },
      { status: 503 }
    );
  }

  const artifacts = await listProjectArtifacts(account.user.id, project.id);
  const promptArtifact = latestArtifact(artifacts, "suno_prompt");
  const lyricsArtifact = latestArtifact(artifacts, "lyrics");
  const stylePrompt = textField(promptArtifact?.payload, "stylePrompt");
  const sunoBlueprint = textField(promptArtifact?.payload, "sunoBlueprint");
  const lyrics =
    textField(lyricsArtifact?.payload, "generationOptimizedLyrics") ||
    textField(lyricsArtifact?.payload, "lyrics");

  if (!stylePrompt || !lyrics) {
    return NextResponse.json(
      {
        ok: false,
        code: "song_blueprint_required",
        message: "Finish Song Architect first so MasterSauce has a style prompt and lyrics to generate."
      },
      { status: 409 }
    );
  }

  try {
    const generated = await generateSongWithLyria(
      buildLyriaPrompt({
        title: project.title,
        stylePrompt,
        sunoBlueprint,
        lyrics
      })
    );

    const stored = await storeGeneratedSongAudio({
      userId: account.user.id,
      projectId: project.id,
      audio: generated.audio,
      mimeType: generated.mimeType
    });

    const generation = await createProjectGeneration({
      userId: account.user.id,
      projectId: project.id,
      source: "lyria",
      externalId: generated.interactionId,
      label: "MasterSauce Generate",
      metadata: {
        provider: "google_lyria",
        model: generated.model,
        mimeType: generated.mimeType,
        storageBucket: stored.bucket,
        storagePath: stored.path,
        description: generated.description,
        returnedLyrics: generated.returnedLyrics
      }
    });

    const nextAccess = await resolveNativeMusicGenerationAccess({
      userId: account.user.id,
      normalizedEmail: account.user.normalizedEmail
    });

    return NextResponse.json(
      {
        ok: true,
        generation,
        audioUrl: `/api/projects/${encodeURIComponent(project.id)}/generations/${encodeURIComponent(generation.id)}/audio`,
        usage: nextAccess.usage
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof MusicGenerationProviderError) {
      console.error("[music-generation] provider_failed", {
        projectId: project.id,
        code: error.code,
        message: error.message
      });
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.code === "provider_timeout"
            ? "Song generation took too long. Try again."
            : "The music generator is temporarily unavailable. Export to Suno is still available."
        },
        { status: error.code === "provider_timeout" ? 504 : 502 }
      );
    }

    console.error("[music-generation] generation_failed", {
      projectId: project.id,
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      {
        ok: false,
        code: "native_generation_failed",
        message: "MasterSauce could not finish this generation. Export to Suno is still available."
      },
      { status: 500 }
    );
  }
}
