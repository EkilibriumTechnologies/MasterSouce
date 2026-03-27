import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";

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

/**
 * Reads env at runtime. Next.js inlines `process.env.NEXT_PUBLIC_*` at build time; a dynamic key
 * keeps the public URL readable from Railway/container env at runtime when only NEXT_PUBLIC_* is set.
 */
function readEnvRaw(name: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }
  return process.env[name];
}

export function getSupabaseAdminConfig(): { url?: string; serviceRoleKey?: string } {
  const nextPublicSupabaseUrl = ["NEXT", "PUBLIC", "SUPABASE", "URL"].join("_");
  return {
    url:
      normalizeEnvValue(readEnvRaw("SUPABASE_URL")) ??
      normalizeEnvValue(readEnvRaw(nextPublicSupabaseUrl)),
    serviceRoleKey: normalizeEnvValue(readEnvRaw("SUPABASE_SERVICE_ROLE_KEY"))
  };
}

/**
 * Supabase API keys are JWTs. `role` must be `service_role` for server writes that bypass RLS.
 * If `anon` is used by mistake, inserts into `public.leads` typically fail with permission errors (500).
 */
export function getSupabaseKeyJwtRole(secret: string | undefined): string | null {
  if (!secret) {
    return null;
  }
  const parts = secret.trim().split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
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
    throw new Error(
      "Supabase admin client requested but SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are not set."
    );
  }
  if (!admin) {
    admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return admin;
}
