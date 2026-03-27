import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function upsertLeadInSupabase(row: { email: string }): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("leads").upsert({ email: row.email }, { onConflict: "email" });
  if (error) {
    const parts = [error.message, error.code, error.details, error.hint].filter(Boolean);
    throw new Error(`Supabase leads upsert failed: ${parts.join(" | ")}`);
  }
}
