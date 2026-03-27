import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | undefined;

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  // Supports accidental "key=value" prefixes in copied .env entries.
  const eqIndex = trimmed.lastIndexOf("=");
  if (eqIndex > 0) {
    const tail = trimmed.slice(eqIndex + 1).trim();
    if (tail) {
      return tail;
    }
  }
  return trimmed;
}

export function getSupabaseAdminConfig(): { url?: string; serviceRoleKey?: string } {
  return {
    url: normalizeEnvValue(process.env.SUPABASE_URL) ?? normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRoleKey: normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  return Boolean(url && serviceRoleKey);
}

/**
 * Service-role client. Import only from server-side code (Route Handlers, Server Actions).
 */
export function getSupabaseAdmin(): SupabaseClient {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin client requested but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.");
  }
  if (!admin) {
    admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return admin;
}
