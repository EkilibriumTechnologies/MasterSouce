import type { NextRequest } from "next/server";

/** Base URL embedded in Supabase Auth emails. Production should pin NEXT_PUBLIC_APP_URL. */
export function resolveAuthRedirectBaseUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return request.nextUrl.origin.replace(/\/+$/, "");
}

