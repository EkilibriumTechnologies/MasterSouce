import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedAccount } from "@/lib/auth/require-user";
import {
  createProjectGeneration,
  listProjectGenerations
} from "@/lib/projects/store";

const GenerationSchema = z.object({
  externalId: z.string().max(240).nullable().optional(),
  externalUrl: z.string().url().max(2000).nullable().optional(),
  label: z.string().max(120).nullable().optional(),
  metadata: z.record(z.unknown()).optional()
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
  const generations = await listProjectGenerations(account.user.id, params.projectId);
  return NextResponse.json({ generations }, {
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
    if (error instanceof Error && error.message === "project_not_found") {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }
    throw error;
  }
}
