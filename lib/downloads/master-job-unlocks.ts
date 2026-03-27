import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type MasterJobUnlockRow = {
  fileId: string;
  normalizedEmail: string;
  originalEmail: string | null;
};

export async function upsertMasterJobUnlock(row: {
  jobId: string;
  fileId: string;
  normalizedEmail: string;
  originalEmail: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("master_job_unlocks").upsert(
    {
      job_id: row.jobId,
      file_id: row.fileId,
      normalized_email: row.normalizedEmail,
      original_email: row.originalEmail
    },
    { onConflict: "job_id" }
  );
  if (error) {
    const parts = [error.message, error.code, error.details, error.hint].filter(Boolean);
    throw new Error(`Supabase master_job_unlocks upsert failed: ${parts.join(" | ")}`);
  }
}

export async function getMasterJobUnlock(jobId: string): Promise<MasterJobUnlockRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("master_job_unlocks")
    .select("file_id, normalized_email, original_email")
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) {
    const parts = [error.message, error.code, error.details, error.hint].filter(Boolean);
    throw new Error(`Supabase master_job_unlocks read failed: ${parts.join(" | ")}`);
  }
  if (!data) return null;
  return {
    fileId: data.file_id as string,
    normalizedEmail: data.normalized_email as string,
    originalEmail: (data.original_email as string | null) ?? null
  };
}
