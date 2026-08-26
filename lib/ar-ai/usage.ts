import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { PlanId } from "@/lib/subscriptions/types";

export type HitAnalyzerUsageQuotaPeriod = "lifetime" | "monthly" | "unlimited";

export type HitAnalyzerUsageSnapshot = {
  used: number;
  limit: number | null;
  remaining: number | null;
  planId: PlanId;
  unlimited: boolean;
  entitled: boolean;
  quotaPeriod: HitAnalyzerUsageQuotaPeriod;
  periodStartIso: string | null;
  periodEndIso: string | null;
};

type HitAnalyzerReportEventStatus = "success" | "openai_failed" | "normalize_failed" | "technical_failed";

type HitAnalyzerReportEventInput = {
  normalizedEmail: string | null;
  planId?: PlanId;
  status: HitAnalyzerReportEventStatus;
  counted: boolean;
  errorCode?: string;
};

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type LocalUsageEvent = { createdAt: Date };

/** In-memory counted usage when Supabase is not configured (local/dev/tests). */
const localUsageEventsByEmail = new Map<string, LocalUsageEvent[]>();

function getLocalUsageEvents(normalizedEmail: string): LocalUsageEvent[] {
  return localUsageEventsByEmail.get(normalizedEmail) ?? [];
}

function countLocalUsageAllTime(normalizedEmail: string): number {
  return getLocalUsageEvents(normalizedEmail).length;
}

function countLocalUsageInPeriod(normalizedEmail: string, periodStart: Date, periodEnd: Date): number {
  return getLocalUsageEvents(normalizedEmail).filter(
    (event) => event.createdAt >= periodStart && event.createdAt < periodEnd
  ).length;
}

function addLocalUsageEvent(normalizedEmail: string, createdAt: Date = new Date()): void {
  const events = getLocalUsageEvents(normalizedEmail);
  events.push({ createdAt });
  localUsageEventsByEmail.set(normalizedEmail, events);
}

function buildSupabaseErrorMeta(error: SupabaseErrorLike | null | undefined): {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
} {
  return {
    message: error?.message?.trim() || "Unknown Supabase error",
    code: error?.code ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null
  };
}

/**
 * Count successful Hit Analyzer evaluations for an email across the full ledger
 * (no period filter). Only rows with counted=true are included.
 */
export async function countHitAnalyzerUsageAllTime(normalizedEmail: string): Promise<number> {
  if (!isSupabaseConfigured()) {
    return countLocalUsageAllTime(normalizedEmail);
  }

  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .schema("public")
    .from("hit_analyzer_report_events")
    .select("id", { count: "exact", head: true })
    .eq("email", normalizedEmail)
    .eq("counted", true);
  if (error) {
    const meta = buildSupabaseErrorMeta(error);
    console.error("[ar-ai] usage_count_query_failed", {
      table: "public.hit_analyzer_report_events",
      filters: { email: normalizedEmail, counted: true, scope: "all_time" },
      supabaseError: meta
    });
    throw new Error(
      `Supabase public.hit_analyzer_report_events count failed: message="${meta.message}" code="${meta.code ?? "unknown"}" details="${meta.details ?? ""}" hint="${meta.hint ?? ""}"`
    );
  }
  return count ?? 0;
}

/**
 * Count successful Hit Analyzer evaluations within a usage window.
 * Only rows with counted=true are included.
 */
export async function countHitAnalyzerUsageInPeriod(
  normalizedEmail: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  if (!isSupabaseConfigured()) {
    return countLocalUsageInPeriod(normalizedEmail, periodStart, periodEnd);
  }

  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .schema("public")
    .from("hit_analyzer_report_events")
    .select("id", { count: "exact", head: true })
    .eq("email", normalizedEmail)
    .eq("counted", true)
    .gte("created_at", periodStart.toISOString())
    .lt("created_at", periodEnd.toISOString());
  if (error) {
    const meta = buildSupabaseErrorMeta(error);
    console.error("[ar-ai] usage_count_query_failed", {
      table: "public.hit_analyzer_report_events",
      filters: {
        email: normalizedEmail,
        counted: true,
        scope: "period",
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString()
      },
      supabaseError: meta
    });
    throw new Error(
      `Supabase public.hit_analyzer_report_events period count failed: message="${meta.message}" code="${meta.code ?? "unknown"}" details="${meta.details ?? ""}" hint="${meta.hint ?? ""}"`
    );
  }
  return count ?? 0;
}

export async function recordHitAnalyzerReportEvent(input: HitAnalyzerReportEventInput): Promise<void> {
  if (isSupabaseConfigured()) {
    const resolvedPlanId = input.planId ?? "free";
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.schema("public").from("hit_analyzer_report_events").insert({
      email: input.normalizedEmail,
      plan_id: resolvedPlanId,
      status: input.status,
      counted: input.counted,
      error_code: input.errorCode ?? null
    });
    if (error) {
      const meta = buildSupabaseErrorMeta(error);
      console.error("[ar-ai] usage_event_insert_failed", {
        table: "public.hit_analyzer_report_events",
        payload: {
          email: input.normalizedEmail,
          plan_id: resolvedPlanId,
          status: input.status,
          counted: input.counted,
          error_code: input.errorCode ?? null
        },
        supabaseError: meta
      });
      throw new Error(
        `Supabase public.hit_analyzer_report_events insert failed: message="${meta.message}" code="${meta.code ?? "unknown"}" details="${meta.details ?? ""}" hint="${meta.hint ?? ""}"`
      );
    }
    return;
  }

  if (input.counted && input.normalizedEmail) {
    addLocalUsageEvent(input.normalizedEmail);
  }
}

async function claimHitAnalyzerQuotaSlot(input: {
  normalizedEmail: string;
  planId: PlanId;
  limit: number;
  periodStart?: Date;
  periodEnd?: Date;
}): Promise<boolean> {
  if (input.limit <= 0) return false;

  if (!isSupabaseConfigured()) {
    if (input.periodStart && input.periodEnd) {
      const used = countLocalUsageInPeriod(input.normalizedEmail, input.periodStart, input.periodEnd);
      if (used >= input.limit) return false;
    } else {
      const used = countLocalUsageAllTime(input.normalizedEmail);
      if (used >= input.limit) return false;
    }
    addLocalUsageEvent(input.normalizedEmail);
    return true;
  }

  const supabase = getSupabaseAdmin();
  const { data: inserted, error: insertError } = await supabase
    .schema("public")
    .from("hit_analyzer_report_events")
    .insert({
      email: input.normalizedEmail,
      plan_id: input.planId,
      status: "success",
      counted: true,
      error_code: null
    })
    .select("id")
    .single();
  if (insertError || !inserted?.id) {
    const meta = buildSupabaseErrorMeta(insertError);
    throw new Error(
      `Supabase public.hit_analyzer_report_events slot insert failed: message="${meta.message}" code="${meta.code ?? "unknown"}" details="${meta.details ?? ""}" hint="${meta.hint ?? ""}"`
    );
  }

  let winnersQuery = supabase
    .schema("public")
    .from("hit_analyzer_report_events")
    .select("id")
    .eq("email", input.normalizedEmail)
    .eq("counted", true)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(input.limit);

  if (input.periodStart && input.periodEnd) {
    winnersQuery = winnersQuery
      .gte("created_at", input.periodStart.toISOString())
      .lt("created_at", input.periodEnd.toISOString());
  }

  const { data: winningRows, error: selectError } = await winnersQuery;
  if (selectError) {
    const meta = buildSupabaseErrorMeta(selectError);
    throw new Error(
      `Supabase public.hit_analyzer_report_events slot check failed: message="${meta.message}" code="${meta.code ?? "unknown"}" details="${meta.details ?? ""}" hint="${meta.hint ?? ""}"`
    );
  }

  if ((winningRows ?? []).some((row) => row.id === inserted.id)) return true;

  const { error: releaseError } = await supabase
    .schema("public")
    .from("hit_analyzer_report_events")
    .update({ counted: false, error_code: "quota_exhausted_concurrent" })
    .eq("id", inserted.id);
  if (releaseError) {
    const meta = buildSupabaseErrorMeta(releaseError);
    throw new Error(
      `Supabase public.hit_analyzer_report_events slot release failed: message="${meta.message}" code="${meta.code ?? "unknown"}" details="${meta.details ?? ""}" hint="${meta.hint ?? ""}"`
    );
  }
  return false;
}

/**
 * Atomically claims one of the earliest lifetime usage slots for a free account.
 * Concurrent direct API requests may all pass the initial read check, so each
 * completed report inserts a counted row and only the first `limit` ledger rows
 * remain valid. Later contenders are immediately uncounted and denied.
 */
export async function consumeHitAnalyzerLifetimeSlot(input: {
  normalizedEmail: string;
  planId: PlanId;
  limit: number;
}): Promise<boolean> {
  return claimHitAnalyzerQuotaSlot(input);
}

/**
 * Atomically claims one monthly usage slot within the billing/usage window.
 * Uses the same concurrent-safe insert + winner selection pattern as lifetime.
 */
export async function consumeHitAnalyzerPeriodSlot(input: {
  normalizedEmail: string;
  planId: PlanId;
  limit: number;
  periodStart: Date;
  periodEnd: Date;
}): Promise<boolean> {
  return claimHitAnalyzerQuotaSlot(input);
}

/** Test-only reset for in-memory usage ledger. */
export function resetHitAnalyzerLocalUsageForTests(): void {
  localUsageEventsByEmail.clear();
}

/** Test-only helper to seed in-memory usage with explicit timestamps. */
export function seedHitAnalyzerLocalUsageForTests(
  normalizedEmail: string,
  events: Array<{ createdAt: Date }>
): void {
  localUsageEventsByEmail.set(
    normalizedEmail,
    events.map((event) => ({ createdAt: event.createdAt }))
  );
}
