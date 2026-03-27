import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function upsertLeadInSupabase(row: { email: string; sessionId: string }): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("leads").upsert(
    {
      email: row.email,
      session_id: row.sessionId
    },
    { onConflict: "email" }
  );
  if (error) {
    throw new Error(`Supabase leads upsert failed: ${error.message}`);
  }
}
