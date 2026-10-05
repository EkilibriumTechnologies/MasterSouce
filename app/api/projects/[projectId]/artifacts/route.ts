import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedAccount } from "@/lib/auth/require-user";
import { isJourneyStageId } from "@/lib/journeys/stages";
import {
  appendProjectArtifact,
  listProjectArtifacts,
  updateProjectForUser
} from "@/lib/projects/store";

const ARTIFACT_KINDS = [
  "idea",
  "song_dna",
  "lyrics",
  "arrangement",
  "suno_prompt",
  "generation_match",
  "hit_analysis",
  "master_readiness",
  "master_settings",
  "export"
] as const;

const ArtifactSchema = z.object({
  kind: z.enum(ARTIFACT_KINDS),
  payload: z.record(z.unknown()),
  advanceTo: z.string().optional()
});

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const account = await requireAuthenticatedAccount(request);
  if (!account) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }
  const artifacts = await listProjectArtifacts(account.user.id, params.projectId);
  return NextResponse.json({ artifacts }, {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const account = await requireAuthenticatedAccount(request);
  if (!account) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = ArtifactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_project_artifact" }, { status: 400 });
  }
  if (parsed.data.advanceTo !== undefined && !isJourneyStageId(parsed.data.advanceTo)) {
    return NextResponse.json({ error: "invalid_journey_stage" }, { status: 400 });
  }

  try {
    const artifact = await appendProjectArtifact({
      userId: account.user.id,
      projectId: params.projectId,
      kind: parsed.data.kind,
      payload: parsed.data.payload
    });

    if (parsed.data.advanceTo) {
      await updateProjectForUser({
        userId: account.user.id,
        projectId: params.projectId,
        currentStage: parsed.data.advanceTo
      });
    }

    return NextResponse.json({ artifact }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "project_not_found") {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }
    throw error;
  }
}
