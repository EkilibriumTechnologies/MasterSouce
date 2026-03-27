import { NextRequest } from "next/server";

export type UserProfile = {
  id: string;
  /** Browser session for anonymous flows; equals id when using cookie-based identity. */
  sessionId: string;
  email: string | null;
  displayName: string | null;
};

function ipToAnonymousId(ip: string | null): string {
  return `anon_${(ip ?? "unknown").replace(/[^a-zA-Z0-9]/g, "_")}`;
}

// MVP placeholder: anonymous profile from request metadata.
// Can be extended later with Supabase Auth (or other) session resolution.
export function getCurrentUserProfile(request: NextRequest): UserProfile {
  const ip = request.headers.get("x-forwarded-for") ?? request.ip ?? null;
  const id = ipToAnonymousId(ip);
  return {
    id,
    sessionId: id,
    email: null,
    displayName: null
  };
}
