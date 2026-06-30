import { getCurrentMonthKeyUtc } from "@/lib/usage/month-key";
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

const localUsageByMonthEmail = new Map<string, number>();

function getLocalUsage(monthKey: string, normalizedEmail: string): number {
  return localUsageByMonthEmail.get(`${monthKey}:${normalizedEmail}`) ?? 0;
}

function incrementLocalUsage(monthKey: string, normalizedEmail: string): void {
  const key = `${monthKey}:${normalizedEmail}`;
  localUsageByMonthEmail.set(key, getLocalUsage(monthKey, normalizedEmail) + 1);
}

function getCurrentMonthBoundsUtc(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
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

export async function countHitAnalyzerUsageThisMonth(normalizedEmail: string): Promise<number> {
  if (!isSupabaseConfigured()) {
    return getLocalUsage(getCurrentMonthKeyUtc(), normalizedEmail);
  }

  const supabase = getSupabaseAdmin();
  const { start, end } = getCurrentMonthBoundsUtc();
  const { count, error } = await supabase
    .schema("public")
    .from("hit_analyzer_report_events")
    .select("id", { count: "exact", head: true })
    .eq("email", normalizedEmail)
    .gte("created_at", start)
    .lt("created_at", end)
    .eq("counted", true);
  if (error) {
    const meta = buildSupabaseErrorMeta(error);
    console.error("[ar-ai] usage_count_query_failed", {
      table: "public.hit_analyzer_report_events",
      filters: { email: normalizedEmail, created_at_gte: start, created_at_lt: end, counted: true },
      supabaseError: meta
    });
    throw new Error(
      `Supabase public.hit_analyzer_report_events count failed: message="${meta.message}" code="${meta.code ?? "unknown"}" details="${meta.details ?? ""}" hint="${meta.hint ?? ""}"`
    );
  }
  return count ?? 0;
}

export async function recordHitAnalyzerReportEvent(input: HitAnalyzerReportEventInput): Promise<void> {
  const monthKey = getCurrentMonthKeyUtc();
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
    incrementLocalUsage(monthKey, input.normalizedEmail);
  }
}

/** Test-only reset for in-memory usage ledger. */
export function resetHitAnalyzerLocalUsageForTests(): void {
  localUsageByMonthEmail.clear();
}
