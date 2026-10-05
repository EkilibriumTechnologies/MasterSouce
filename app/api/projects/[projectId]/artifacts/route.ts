import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedAccount } from "@/lib/auth/require-user";
import { JOURNEY_STAGE_IDS } from "@/lib/journeys/stages";
import {
  authenticationRequiredResponse,
  projectNotFoundResponse,
  projectStoreErrorResponse
} from "@/lib/projects/route-errors";
import {
  appendProjectArtifact,
  getProjectForUser,
  listProjectArtifacts
} from "@/lib/projects/store";
import { PROJECT_ARTIFACT_KINDS } from "@/lib/projects/types";

const ArtifactSchema = z
  .object({
    kind: z.enum(PROJECT_ARTIFACT_KINDS),
    payload: z.record(z.unknown()),
    // Optional link to a generation candidate; ownership is verified server-side.
    generationId: z.string().uuid().optional(),
    // Tool autosaves only ever move the Journey forward (see advanceProjectStageForUser).
    advanceTo: z.enum(JOURNEY_STAGE_IDS).optional()
  })
  .strict();

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const account = await requireAuthenticatedAccount(request);
  if (!account) return authenticationRequiredResponse();

  const project = await getProjectForUser(account.user.id, params.projectId);
  if (!project) return projectNotFoundResponse();

  const artifacts = await listProjectArtifacts(account.user.id, project.id);
  return NextResponse.json({ artifacts }, {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const account = await requireAuthenticatedAccount(request);
  if (!account) return authenticationRequiredResponse();

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

  try {
    const { artifact, project } = await appendProjectArtifact({
      userId: account.user.id,
      projectId: params.projectId,
      kind: parsed.data.kind,
      payload: parsed.data.payload,
      generationId: parsed.data.generationId,
      advanceTo: parsed.data.advanceTo
    });

    return NextResponse.json({ artifact, project }, { status: 201 });
  } catch (error) {
    const handled = projectStoreErrorResponse(error);
    if (handled) return handled;
    throw error;
  }
}
