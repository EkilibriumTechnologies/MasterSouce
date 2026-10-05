import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function getSupabasePublicConfig(): { url?: string; publishableKey?: string } {
  return {
    url: clean(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? clean(process.env.SUPABASE_URL),
    publishableKey:
      clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
      clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  };
}

/**
 * Server-only Supabase Auth client built from the publishable key (never service_role).
 * A fresh client per request keeps one visitor's verified session out of another request's memory.
 * Magic links are verified server-side with `verifyOtp({ token_hash })` at /auth/confirm, so no
 * Supabase tokens are ever handed to the browser.
 */
export function createSupabaseAuthServerClient(): SupabaseClient {
  const { url, publishableKey } = getSupabasePublicConfig();
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase Auth requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }
  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
