import { NextResponse } from "next/server";
import { clearAppSession } from "@/lib/auth/app-session";
import { clearTrustedEmailAccessState } from "@/lib/security/verified-email-state";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAppSession(res);
  clearTrustedEmailAccessState(res);
  return res;
}
