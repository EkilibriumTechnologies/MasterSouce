import { getBillingSubscriptionByEmail } from "@/lib/billing/store";
import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import type { PlanId } from "@/lib/subscriptions/types";
import { getCurrentMonthKeyUtc } from "@/lib/usage/month-key";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export type SongArchitectUsageSnapshot = {
  used: number;
  limit: number;
  remaining: number;
  planId: PlanId;
  entitled: boolean;
};

type SongArchitectEventStatus = "success" | "openai_failed" | "timeout" | "invalid_json" | "normalize_failed";

type SongArchitectGenerationEventInput = {
  normalizedEmail: string;
  planId?: PlanId;
  presetUsed?: string;
  genre?: string;
  theme?: string;
  status: SongArchitectEventStatus;
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

async function resolvePlanIdForEmail(normalizedEmail: string): Promise<PlanId> {
  if (!isSupabaseConfigured()) return "free";
  const sub = await getBillingSubscriptionByEmail(normalizedEmail);
  return sub?.planId ?? "free";
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

async function countSupabaseUsageThisMonth(normalizedEmail: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { start, end } = getCurrentMonthBoundsUtc();
  const { count, error } = await supabase
    .schema("public")
    .from("song_architect_generation_events")
    .select("id", { count: "exact", head: true })
    .eq("email", normalizedEmail)
    .gte("created_at", start)
    .lt("created_at", end)
    .eq("counted", true);
  if (error) {
    const meta = buildSupabaseErrorMeta(error);
    console.error("[song-architect] usage_count_query_failed", {
      table: "public.song_architect_generation_events",
      filters: { email: normalizedEmail, created_at_gte: start, created_at_lt: end, counted: true },
      supabaseError: meta
    });
    throw new Error(
      `Supabase public.song_architect_generation_events count failed: message="${meta.message}" code="${meta.code ?? "unknown"}" details="${meta.details ?? ""}" hint="${meta.hint ?? ""}"`
    );
  }
  return count ?? 0;
}

export async function resolveSongArchitectUsageForEmail(normalizedEmail: string): Promise<SongArchitectUsageSnapshot> {
  const monthKey = getCurrentMonthKeyUtc();
  const planId = await resolvePlanIdForEmail(normalizedEmail);
  const limit = PLAN_DEFINITIONS[planId].songArchitectGenerationsPerMonth;
  const used = isSupabaseConfigured()
    ? await countSupabaseUsageThisMonth(normalizedEmail)
    : getLocalUsage(monthKey, normalizedEmail);
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    planId,
    entitled: used < limit
  };
}

export async function recordSongArchitectGenerationEvent(input: SongArchitectGenerationEventInput): Promise<void> {
  const monthKey = getCurrentMonthKeyUtc();
  if (isSupabaseConfigured()) {
    const resolvedPlanId = input.planId ?? "free";
    if (!input.planId) {
      console.warn("[song-architect] usage_event_missing_plan_id_fallback", {
        normalizedEmail: input.normalizedEmail,
        fallbackPlanId: resolvedPlanId,
        status: input.status
      });
    }
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.schema("public").from("song_architect_generation_events").insert({
      email: input.normalizedEmail,
      plan_id: resolvedPlanId,
      status: input.status,
      counted: input.counted,
      preset_used: input.presetUsed ?? null,
      genre: input.genre ?? null,
      theme: input.theme ?? null
    });
    if (error) {
      const meta = buildSupabaseErrorMeta(error);
      console.error("[song-architect] usage_event_insert_failed", {
        table: "public.song_architect_generation_events",
        payload: {
          email: input.normalizedEmail,
          plan_id: resolvedPlanId,
          status: input.status,
          counted: input.counted,
          preset_used: input.presetUsed ?? null,
          genre: input.genre ?? null,
          theme: input.theme ?? null
        },
        supabaseError: meta
      });
      throw new Error(
        `Supabase public.song_architect_generation_events insert failed: message="${meta.message}" code="${meta.code ?? "unknown"}" details="${meta.details ?? ""}" hint="${meta.hint ?? ""}"`
      );
    }
    return;
  }

  if (input.counted) {
    incrementLocalUsage(monthKey, input.normalizedEmail);
  }
}
