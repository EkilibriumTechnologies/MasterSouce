import type { NextRequest } from "next/server";
import { getCurrentUserProfile, type UserProfile } from "@/lib/users/user-profile";

export function buildApiUser(request: NextRequest, sessionId: string): UserProfile {
  const base = getCurrentUserProfile(request);
  return { ...base, id: sessionId, sessionId };
}
