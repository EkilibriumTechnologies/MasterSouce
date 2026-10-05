import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedAccount } from "@/lib/auth/require-user";
import { createProjectForUser, listProjectsForUser } from "@/lib/projects/store";

const CreateProjectSchema = z.object({
  title: z.string().max(140).optional()
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const account = await requireAuthenticatedAccount(request);
  if (!account) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const projects = await listProjectsForUser(account.user.id);
  return NextResponse.json({ projects }, {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request: NextRequest) {
  const account = await requireAuthenticatedAccount(request);
  if (!account) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_project" }, { status: 400 });
  }

  const project = await createProjectForUser(account.user.id, parsed.data.title);
  return NextResponse.json({ project }, { status: 201 });
}
