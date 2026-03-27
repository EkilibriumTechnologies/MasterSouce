import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type RecordMasteredDownloadResult = {
  countedUnique: boolean;
  attemptType: "unique" | "repeat";
};

/**
 * Idempotent unique counter: at most one row with counted_unique in the last 30 days
 * per normalized email + job + file; enforced in Postgres via advisory lock + transaction.
 */
export async function recordMasteredDownloadAttempt(row: {
  normalizedEmail: string;
  originalEmail: string;
  jobId: string;
  fileId: string;
  requestMetadata?: Record<string, unknown>;
}): Promise<RecordMasteredDownloadResult> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("record_mastered_download_attempt", {
    p_normalized_email: row.normalizedEmail,
    p_original_email: row.originalEmail,
    p_job_id: row.jobId,
    p_file_id: row.fileId,
    p_lead_id: null,
    p_request_metadata: row.requestMetadata ?? null
  });

  if (error) {
    const parts = [error.message, error.code, error.details, error.hint].filter(Boolean);
    throw new Error(`record_mastered_download_attempt RPC failed: ${parts.join(" | ")}`);
  }

  const row0 = Array.isArray(data) ? data[0] : null;
  if (!row0 || typeof row0 !== "object") {
    throw new Error("record_mastered_download_attempt returned no row");
  }

  const counted = (row0 as { counted_unique?: boolean }).counted_unique;
  const attempt = (row0 as { attempt_type?: string }).attempt_type;

  return {
    countedUnique: Boolean(counted),
    attemptType: attempt === "repeat" ? "repeat" : "unique"
  };
}
