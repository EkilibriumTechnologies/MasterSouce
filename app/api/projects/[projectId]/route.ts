import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedAccount } from "@/lib/auth/require-user";
import { isJourneyStageId } from "@/lib/journeys/stages";
import {
  getProjectForUser,
  listProjectArtifacts,
  listProjectGenerations,
  updateProjectForUser
} from "@/lib/projects/store";

const PatchSchema = z.object({
  title: z.string().max(140).optional(),
  status: z.enum(["active", "archived", "complete"]).optional(),
  currentStage: z.string().optional(),
  selectedGenerationId: z.string().uuid().nullable().optional()
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

  const project = await getProjectForUser(account.user.id, params.projectId);
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

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
  if (!account) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

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
  if (
    parsed.data.currentStage !== undefined &&
    !isJourneyStageId(parsed.data.currentStage)
  ) {
    return NextResponse.json({ error: "invalid_journey_stage" }, { status: 400 });
  }

  const project = await updateProjectForUser({
    userId: account.user.id,
    projectId: params.projectId,
    title: parsed.data.title,
    status: parsed.data.status,
    currentStage: parsed.data.currentStage,
    selectedGenerationId: parsed.data.selectedGenerationId
  });
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}
