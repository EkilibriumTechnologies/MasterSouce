import type { PlanId } from "@/lib/subscriptions/types";
import { normalizeBillingEmail } from "./email";
import { getAdaptiveEntitlementByEmail } from "./store";

export type AdaptiveEntitlementApiResult = {
  entitled: boolean;
  reason: string;
  planId: PlanId;
  subscriptionStatus: string | null;
  entitlementActive: boolean | null;
};

function planIdFromEntitlementMetadata(metadata: Record<string, unknown>): PlanId {
  const raw = metadata.planId;
  if (raw === "creator_monthly" || raw === "pro_studio_monthly") return raw;
  return "creator_monthly";
}

/**
 * Adaptive **export** entitlement: only `billing_entitlements` with
 * `entitlement = adaptive_access` and `is_active = true` (Stripe webhook / sync is source of truth).
 */
export async function resolveAdaptiveEntitlementForEmail(rawEmail: string | null | undefined): Promise<AdaptiveEntitlementApiResult> {
  const normalized = rawEmail ? normalizeBillingEmail(rawEmail) : null;
  if (!normalized) {
    return {
      entitled: false,
      reason: "missing_or_invalid_billing_email",
      planId: "free",
      subscriptionStatus: null,
      entitlementActive: null
    };
  }

  const ent = await getAdaptiveEntitlementByEmail(normalized);
  if (ent?.isActive) {
    return {
      entitled: true,
      reason: "adaptive_entitlement_active",
      planId: planIdFromEntitlementMetadata(ent.metadata),
      subscriptionStatus: null,
      entitlementActive: true
    };
  }

  return {
    entitled: false,
    reason: "no_active_adaptive_entitlement",
    planId: "free",
    subscriptionStatus: null,
    entitlementActive: ent?.isActive ?? false
  };
}
