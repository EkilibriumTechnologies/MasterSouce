import { getBillingSubscriptionByEmail } from "@/lib/billing/store";
import { getJourneyDb } from "@/lib/journeys/db";
import { isLyriaConfigured } from "@/lib/music-generation/lyria";
import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import type { PlanId } from "@/lib/subscriptions/types";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export type NativeMusicGenerationUsage = {
  used: number;
  limit: number;
  remaining: number;
};

export type NativeMusicGenerationAccess = {
  planId: PlanId;
  eligible: boolean;
  configured: boolean;
  usage: NativeMusicGenerationUsage;
};

function monthBoundsUtc(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function isNativeMusicGenerationEnabled(): boolean {
  const raw = process.env.NATIVE_MUSIC_GENERATION_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function isNativeMusicGenerationAllowlisted(normalizedEmail: string): boolean {
  const entries = (process.env.NATIVE_MUSIC_GENERATION_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return entries.includes(normalizedEmail.trim().toLowerCase());
}

async function countNativeGenerationsThisMonth(userId: string): Promise<number> {
  const { start, end } = monthBoundsUtc();
  const supabase = getJourneyDb();
  const { count, error } = await supabase
    .from("project_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "lyria")
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) throw new Error(`Native music usage count failed: ${error.message}`);
  return count ?? 0;
}

export async function resolveNativeMusicGenerationAccess(input: {
  userId: string;
  normalizedEmail: string;
}): Promise<NativeMusicGenerationAccess> {
  const subscription = await getBillingSubscriptionByEmail(input.normalizedEmail);
  const allowlisted = isNativeMusicGenerationAllowlisted(input.normalizedEmail);
  const planId: PlanId = allowlisted ? "pro_studio_monthly" : subscription?.planId ?? "free";
  const limit = PLAN_DEFINITIONS[planId].nativeSongGenerationsPerMonth;
  const used = await countNativeGenerationsThisMonth(input.userId);
  const remaining = Math.max(limit - used, 0);

  return {
    planId,
    eligible: planId === "pro_studio_monthly" && remaining > 0,
    configured:
      isNativeMusicGenerationEnabled() &&
      isSupabaseConfigured() &&
      isLyriaConfigured(),
    usage: { used, limit, remaining }
  };
}
