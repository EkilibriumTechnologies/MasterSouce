import { NextRequest } from "next/server";

export type UserProfile = {
  id: string;
  email: string | null;
  displayName: string | null;
  authProvider: "anonymous" | "firebase";
};

function ipToAnonymousId(ip: string | null): string {
  return `anon_${(ip ?? "unknown").replace(/[^a-zA-Z0-9]/g, "_")}`;
}

// MVP placeholder: anonymous profile from request metadata.
// Later replace with Firebase Auth session resolution.
export function getCurrentUserProfile(request: NextRequest): UserProfile {
  const ip = request.headers.get("x-forwarded-for") ?? request.ip ?? null;
  return {
    id: ipToAnonymousId(ip),
    email: null,
    displayName: null,
    authProvider: "anonymous"
  };
}
