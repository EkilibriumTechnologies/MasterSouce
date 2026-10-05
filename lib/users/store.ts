import { normalizeBillingEmail } from "@/lib/billing/email";
import { getJourneyDb } from "@/lib/journeys/db";

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

/**
 * Historical rows that may be attributed to a verified account. Billing tables are Stripe-anchored;
 * event tables are attribution only and never used for authorization or Project ownership.
 */
const HISTORY_LINK_TARGETS = [
  { table: "billing_customers", emailColumn: "normalized_email" },
  { table: "billing_subscriptions", emailColumn: "normalized_email" },
  { table: "credit_pack_ledger", emailColumn: "normalized_email" },
  { table: "master_job_unlocks", emailColumn: "normalized_email" },
  { table: "mastered_download_events", emailColumn: "normalized_email" },
  { table: "song_architect_generation_events", emailColumn: "email" },
  { table: "hit_analyzer_report_events", emailColumn: "email" },
  { table: "song_architect_reference_tracks", emailColumn: "owner_email" }
] as const;

export type HistoryLinkResult = {
  ok: boolean;
  failedTables: string[];
};

export type VerifiedUserUpsertResult = {
  user: MasterSauceUser;
  historyLink: HistoryLinkResult;
};

/**
 * Links unclaimed historical rows for a verified mailbox to the stable user id.
 * Rows already linked to a user are never reassigned, so a later owner of a recycled
 * email address cannot take over another account's history.
 */
export async function linkVerifiedUserHistory(
  userId: string,
  normalizedEmail: string
): Promise<HistoryLinkResult> {
  const supabase = getJourneyDb();
  const results = await Promise.allSettled(
    HISTORY_LINK_TARGETS.map(async ({ table, emailColumn }) => {
      const { error } = await supabase
        .from(table)
        .update({ user_id: userId })
        .eq(emailColumn, normalizedEmail)
        .is("user_id", null);
      if (error) throw new Error(error.message);
    })
  );

  const failedTables: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const table = HISTORY_LINK_TARGETS[index].table;
      failedTables.push(table);
      console.error("[users] history_link_failed", {
        table,
        userId,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason)
      });
    }
  });
  return { ok: failedTables.length === 0, failedTables };
}

export async function getMasterSauceUserById(userId: string): Promise<MasterSauceUser | null> {
  const supabase = getJourneyDb();
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
}): Promise<VerifiedUserUpsertResult> {
  const normalizedEmail = normalizeBillingEmail(input.email);
  if (!normalizedEmail) throw new Error("Verified auth user is missing a valid email.");

  const supabase = getJourneyDb();
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
  } else if (existingByEmail) {
    // Claim a billing-bootstrapped row only while it is still unclaimed (race-safe).
    const result = await supabase
      .from("users")
      .update(payload)
      .eq("id", existingByEmail.id)
      .is("auth_user_id", null)
      .select(userSelect)
      .maybeSingle();
    data = (result.data as Record<string, unknown> | null) ?? null;
    writeError = result.error ?? (data ? null : { message: "account was claimed concurrently" });
  } else {
    const result = await supabase
      .from("users")
      .insert(payload)
      .select(userSelect)
      .single();
    data = (result.data as Record<string, unknown> | null) ?? null;
    writeError = result.error;
  }

  if (writeError || !data) {
    throw new Error(`users upsert failed: ${writeError?.message ?? "no user row returned"}`);
  }

  const user = mapUser(data);
  const historyLink = await linkVerifiedUserHistory(user.id, normalizedEmail);
  return { user, historyLink };
}
