import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedAccount } from "@/lib/auth/require-user";
import {
  authenticationRequiredResponse,
  projectNotFoundResponse,
  projectStoreErrorResponse
} from "@/lib/projects/route-errors";
import {
  createProjectGeneration,
  getProjectForUser,
  listProjectGenerations
} from "@/lib/projects/store";
import { isSafeExternalUrl } from "@/lib/projects/types";

const GenerationSchema = z
  .object({
    externalId: z.string().max(240).nullable().optional(),
    externalUrl: z
      .string()
      .max(2000)
      .refine(isSafeExternalUrl, "externalUrl must be an http(s) URL")
      .nullable()
      .optional(),
    label: z.string().max(120).nullable().optional(),
    metadata: z.record(z.unknown()).optional()
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

  const generations = await listProjectGenerations(account.user.id, project.id);
  return NextResponse.json({ generations }, {
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

  const parsed = GenerationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_generation" }, { status: 400 });
  }

  try {
    const generation = await createProjectGeneration({
      userId: account.user.id,
      projectId: params.projectId,
      ...parsed.data
    });
    return NextResponse.json({ generation }, { status: 201 });
  } catch (error) {
    const handled = projectStoreErrorResponse(error);
    if (handled) return handled;
    throw error;
  }
}
