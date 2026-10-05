import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Server-only data access for accounts and Song Projects. Every query that reaches these
// tables must be scoped by the authenticated stable `public.users.id`.
let testClient: SupabaseClient | null = null;

export function getJourneyDb(): SupabaseClient {
  return testClient ?? getSupabaseAdmin();
}

/** Test seam: lets invariant suites run the real stores against an in-memory fake. */
export function setJourneyDbForTests(client: unknown): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setJourneyDbForTests is not available in production.");
  }
  testClient = (client as SupabaseClient | null) ?? null;
}
