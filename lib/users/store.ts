import { normalizeBillingEmail } from "@/lib/billing/email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type MasterSauceUser = {
  id: string;
  authUserId: string | null;
  normalizedEmail: string;
  email: string;
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapUser(row: Record<string, unknown>): MasterSauceUser {
  return {
    id: String(row.id),
    authUserId: typeof row.auth_user_id === "string" ? row.auth_user_id : null,
    normalizedEmail: String(row.normalized_email),
    email: String(row.email),
    stripeCustomerId: typeof row.stripe_customer_id === "string" ? row.stripe_customer_id : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export async function getMasterSauceUserById(userId: string): Promise<MasterSauceUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("id, auth_user_id, normalized_email, email, stripe_customer_id, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`users read failed: ${error.message}`);
  return data ? mapUser(data as Record<string, unknown>) : null;
}

export async function upsertVerifiedMasterSauceUser(input: {
  authUserId: string;
  email: string;
}): Promise<MasterSauceUser> {
  const normalizedEmail = normalizeBillingEmail(input.email);
  if (!normalizedEmail) throw new Error("Verified auth user is missing a valid email.");

  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("users")
    .select("id, auth_user_id, normalized_email, email, stripe_customer_id, created_at, updated_at")
    .eq("normalized_email", normalizedEmail)
    .maybeSingle();
  if (existingError) throw new Error(`users lookup failed: ${existingError.message}`);

  if (
    existing?.auth_user_id &&
    existing.auth_user_id !== input.authUserId
  ) {
    throw new Error("Verified email is already linked to another auth identity.");
  }

  const { data: billingCustomer, error: billingError } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("normalized_email", normalizedEmail)
    .maybeSingle();
  if (billingError) throw new Error(`billing customer lookup failed: ${billingError.message}`);

  const now = new Date().toISOString();
  const payload = {
    normalized_email: normalizedEmail,
    email: input.email.trim(),
    auth_user_id: input.authUserId,
    stripe_customer_id:
      typeof billingCustomer?.stripe_customer_id === "string"
        ? billingCustomer.stripe_customer_id
        : existing?.stripe_customer_id ?? null,
    updated_at: now
  };

  const { data, error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "normalized_email" })
    .select("id, auth_user_id, normalized_email, email, stripe_customer_id, created_at, updated_at")
    .single();
  if (error) throw new Error(`users upsert failed: ${error.message}`);

  const user = mapUser(data as Record<string, unknown>);

  await Promise.all([
    supabase.from("billing_customers").update({ user_id: user.id }).eq("normalized_email", normalizedEmail),
    supabase.from("billing_subscriptions").update({ user_id: user.id }).eq("normalized_email", normalizedEmail),
    supabase.from("credit_pack_ledger").update({ user_id: user.id }).eq("normalized_email", normalizedEmail),
    supabase.from("song_architect_generation_events").update({ user_id: user.id }).eq("email", normalizedEmail),
    supabase.from("hit_analyzer_report_events").update({ user_id: user.id }).eq("email", normalizedEmail),
    supabase.from("song_architect_reference_tracks").update({ user_id: user.id }).eq("owner_email", normalizedEmail),
    supabase.from("master_job_unlocks").update({ user_id: user.id }).eq("normalized_email", normalizedEmail),
    supabase.from("mastered_download_events").update({ user_id: user.id }).eq("normalized_email", normalizedEmail)
  ]);

  return user;
}
