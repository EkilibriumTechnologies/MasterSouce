import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const FREE_COMPLETED_MASTERS_PER_MONTH = 4;

/** UTC `YYYY-MM`, aligned with in-memory quota period. */
export function getCurrentMonthKeyUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function countCompletedMasterizationsForMonth(
  email: string | null,
  sessionId: string,
  monthKey: string
): Promise<number> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("mastering_usage")
    .select("id", { count: "exact", head: true })
    .eq("month_key", monthKey)
    .eq("status", "completed");

  if (email) {
    q = q.eq("email", email);
  } else {
    q = q.is("email", null).eq("session_id", sessionId);
  }

  const { count, error } = await q;
  if (error) {
    throw new Error(`Supabase mastering_usage count failed: ${error.message}`);
  }
  return count ?? 0;
}

export async function insertCompletedMasteringUsage(row: {
  email: string | null;
  sessionId: string;
  monthKey: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("mastering_usage").insert({
    email: row.email,
    session_id: row.sessionId,
    month_key: row.monthKey,
    status: "completed"
  });
  if (error) {
    throw new Error(`Supabase mastering_usage insert failed: ${error.message}`);
  }
}
