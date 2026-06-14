import { normalizeBillingEmail } from "@/lib/billing/email";
import type { PlanId } from "@/lib/subscriptions/types";

let cachedAllowlist: Map<string, PlanId> | null = null;

const ALLOWLIST_PLAN_IDS = new Set<PlanId>(["creator_monthly", "pro_studio_monthly"]);

function parseAllowlistEntry(raw: string): { email: string; planId: PlanId } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const sep = trimmed.indexOf(":");
  if (sep <= 0) return null;
  const email = normalizeBillingEmail(trimmed.slice(0, sep));
  const planRaw = trimmed.slice(sep + 1).trim();
  if (!email || !ALLOWLIST_PLAN_IDS.has(planRaw as PlanId)) return null;
  return { email, planId: planRaw as PlanId };
}

function loadMasterWavExportAllowlist(): Map<string, PlanId> {
  if (cachedAllowlist) return cachedAllowlist;
  const raw = process.env.MASTER_WAV_EXPORT_ALLOWLIST?.trim() ?? "";
  const map = new Map<string, PlanId>();
  for (const part of raw.split(/[,;\n]+/)) {
    const parsed = parseAllowlistEntry(part);
    if (parsed) map.set(parsed.email, parsed.planId);
  }
  cachedAllowlist = map;
  return cachedAllowlist;
}

/** Server-only owner/comp export quality; does not mutate Stripe billing rows. */
export function resolveMasterWavExportPlanOverride(normalizedEmail: string | null | undefined): PlanId | null {
  if (!normalizedEmail) return null;
  const normalized = normalizeBillingEmail(normalizedEmail);
  if (!normalized) return null;
  return loadMasterWavExportAllowlist().get(normalized) ?? null;
}
