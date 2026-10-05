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
  const userSelect =
    "id, auth_user_id, normalized_email, email, stripe_customer_id, created_at, updated_at";

  const [{ data: existingByAuth, error: authLookupError }, { data: existingByEmail, error: emailLookupError }] =
    await Promise.all([
      supabase.from("users").select(userSelect).eq("auth_user_id", input.authUserId).maybeSingle(),
      supabase.from("users").select(userSelect).eq("normalized_email", normalizedEmail).maybeSingle()
    ]);

  if (authLookupError) throw new Error(`users auth lookup failed: ${authLookupError.message}`);
  if (emailLookupError) throw new Error(`users email lookup failed: ${emailLookupError.message}`);

  if (
    existingByEmail?.auth_user_id &&
    existingByEmail.auth_user_id !== input.authUserId
  ) {
    throw new Error("Verified email is already linked to another auth identity.");
  }

  if (
    existingByAuth &&
    existingByEmail &&
    existingByAuth.id !== existingByEmail.id
  ) {
    throw new Error("Verified email is already linked to another MasterSauce account.");
  }

  const existing = existingByAuth ?? existingByEmail;

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

  let data: Record<string, unknown> | null = null;
  let writeError: { message: string } | null = null;

  if (existingByAuth) {
    const result = await supabase
      .from("users")
      .update(payload)
      .eq("id", existingByAuth.id)
      .select(userSelect)
      .single();
    data = (result.data as Record<string, unknown> | null) ?? null;
    writeError = result.error;
  } else {
    const result = await supabase
      .from("users")
      .upsert(payload, { onConflict: "normalized_email" })
      .select(userSelect)
      .single();
    data = (result.data as Record<string, unknown> | null) ?? null;
    writeError = result.error;
  }

  if (writeError || !data) {
    throw new Error(`users upsert failed: ${writeError?.message ?? "no user row returned"}`);
  }

  const user = mapUser(data);

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
