import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attachAppSession } from "@/lib/auth/app-session";
import { attachTrustedEmailAccessState } from "@/lib/security/verified-email-state";
import { getSupabasePublicClient } from "@/lib/supabase/public-server";
import { upsertVerifiedMasterSauceUser } from "@/lib/users/store";

const BodySchema = z.object({
  accessToken: z.string().min(20)
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing login token." }, { status: 400 });
  }

  const supabase = getSupabasePublicClient();
  const { data, error } = await supabase.auth.getUser(parsed.data.accessToken);
  const authUser = data.user;

  if (error || !authUser?.id || !authUser.email) {
    return NextResponse.json(
      { error: "This sign-in link is invalid or expired." },
      { status: 401 }
    );
  }

  const user = await upsertVerifiedMasterSauceUser({
    authUserId: authUser.id,
    email: authUser.email
  });

  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email
    }
  });
  attachAppSession(res, {
    userId: user.id,
    authUserId: authUser.id,
    normalizedEmail: user.normalizedEmail
  });
  attachTrustedEmailAccessState(res, user.normalizedEmail, "authenticated_user");
  return res;
}
