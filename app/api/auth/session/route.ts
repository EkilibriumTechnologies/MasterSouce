import { NextRequest, NextResponse } from "next/server";
import { readAppSession } from "@/lib/auth/app-session";
import { getMasterSauceUserById } from "@/lib/users/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = readAppSession(request);
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null }, {
      headers: { "Cache-Control": "no-store" }
    });
  }

  const user = await getMasterSauceUserById(session.userId);
  if (!user || user.authUserId !== session.authUserId) {
    return NextResponse.json({ authenticated: false, user: null }, {
      status: 401,
      headers: { "Cache-Control": "no-store" }
    });
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        normalizedEmail: user.normalizedEmail
      }
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
