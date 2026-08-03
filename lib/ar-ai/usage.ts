import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { PlanId } from "@/lib/subscriptions/types";

export type HitAnalyzerUsageSnapshot = {
  used: number;
  limit: number | null;
  remaining: number | null;
  planId: PlanId;
  unlimited: boolean;
  entitled: boolean;
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

/** In-memory all-time counted usage when Supabase is not configured (local/dev/tests). */
const localUsageByEmail = new Map<string, number>();

function getLocalUsage(normalizedEmail: string): number {
  return localUsageByEmail.get(normalizedEmail) ?? 0;
}

function incrementLocalUsage(normalizedEmail: string): void {
  localUsageByEmail.set(normalizedEmail, getLocalUsage(normalizedEmail) + 1);
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
 * (no month filter). Only rows with counted=true are included.
 */
export async function countHitAnalyzerUsageAllTime(normalizedEmail: string): Promise<number> {
  if (!isSupabaseConfigured()) {
    return getLocalUsage(normalizedEmail);
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

/** @deprecated Prefer countHitAnalyzerUsageAllTime — kept name alias for older imports/tests. */
export async function countHitAnalyzerUsageThisMonth(normalizedEmail: string): Promise<number> {
  return countHitAnalyzerUsageAllTime(normalizedEmail);
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
    incrementLocalUsage(input.normalizedEmail);
  }
}

/** Test-only reset for in-memory usage ledger. */
export function resetHitAnalyzerLocalUsageForTests(): void {
  localUsageByEmail.clear();
}
