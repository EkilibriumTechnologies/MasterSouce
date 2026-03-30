import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Matches `record_mastered_download_attempt`: repeat downloads of the same job+file within 30 days are not billable. */
export async function hasRecentBillableDownloadForJobFile(
  normalizedEmail: string,
  jobId: string,
  fileId: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("mastered_download_events")
    .select("id")
    .eq("normalized_email", normalizedEmail.trim().toLowerCase())
    .eq("job_id", jobId)
    .eq("file_id", fileId)
    .eq("counted_unique", true)
    .gte("downloaded_at", since)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase mastered_download_events lookup failed: ${error.message}`);
  }
  return data != null;
}

/** Billable downloads this calendar month (UTC): rows where the first fetch of a job+file counted toward quota. */
export async function countBillableDownloadsForMonth(normalizedEmail: string, monthKey: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)).toISOString();

  const { count, error } = await supabase
    .from("mastered_download_events")
    .select("id", { count: "exact", head: true })
    .eq("normalized_email", normalizedEmail.trim().toLowerCase())
    .eq("counted_unique", true)
    .gte("downloaded_at", start)
    .lt("downloaded_at", end);

  if (error) {
    throw new Error(`Supabase download usage count failed: ${error.message}`);
  }
  return count ?? 0;
}
