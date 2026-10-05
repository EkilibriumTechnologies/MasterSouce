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
  getProjectForUser,
  listProjectArtifacts,
  listProjectGenerations,
  updateProjectForUser
} from "@/lib/projects/store";
import { PROJECT_STATUSES } from "@/lib/projects/types";

const PatchSchema = z
  .object({
    title: z.string().max(140).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    currentStage: z.enum(JOURNEY_STAGE_IDS).optional(),
    selectedGenerationId: z.string().uuid().nullable().optional()
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

  const [artifacts, generations] = await Promise.all([
    listProjectArtifacts(account.user.id, project.id),
    listProjectGenerations(account.user.id, project.id)
  ]);

  return NextResponse.json(
    { project, artifacts, generations },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PATCH(
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

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_project_patch" }, { status: 400 });
  }

  try {
    const project = await updateProjectForUser({
      userId: account.user.id,
      projectId: params.projectId,
      title: parsed.data.title,
      status: parsed.data.status,
      currentStage: parsed.data.currentStage,
      selectedGenerationId: parsed.data.selectedGenerationId
    });
    if (!project) return projectNotFoundResponse();

    return NextResponse.json({ project });
  } catch (error) {
    const handled = projectStoreErrorResponse(error);
    if (handled) return handled;
    throw error;
  }
}
