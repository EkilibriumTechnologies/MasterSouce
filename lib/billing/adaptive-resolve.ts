import type { PlanId } from "@/lib/subscriptions/types";
import { reconcileAdaptiveEntitlementFromStripeByEmail } from "./adaptive-stripe-fallback";
import { normalizeBillingEmail } from "./email";
import { getAdaptiveEntitlementByEmail } from "./store";

export type AdaptiveEntitlementApiResult = {
  entitled: boolean;
  reason: string;
  planId: PlanId;
  subscriptionStatus: string | null;
  entitlementActive: boolean | null;
  /** True when a direct Stripe-by-email reconcile was executed (export / access recovery path). */
  stripeEmailSyncAttempted: boolean;
  /** True when Stripe reconcile repopulated an active adaptive row. */
  stripeEmailSyncRecovered: boolean;
};

export type ResolveAdaptiveEntitlementOptions = {
  /**
   * When the DB has no active `adaptive_access` row, query Stripe by email and run the same
   * reconcile path as webhooks (billing_customers, billing_subscriptions, billing_entitlements).
   */
  stripeEmailFallback?: boolean;
};

function planIdFromEntitlementMetadata(metadata: Record<string, unknown>): PlanId {
  const raw = metadata.planId;
  if (raw === "creator_monthly" || raw === "pro_studio_monthly") return raw;
  return "creator_monthly";
}

function logAdaptiveEntitlement(event: string, fields: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      scope: "adaptive_entitlement",
      event,
      ...fields
    })
  );
}

/**
 * Adaptive **export** entitlement: only `billing_entitlements` with
 * `entitlement = adaptive_access` and `is_active = true` (Stripe webhook / sync is source of truth).
 */
export async function resolveAdaptiveEntitlementForEmail(
  rawEmail: string | null | undefined,
  options?: ResolveAdaptiveEntitlementOptions
): Promise<AdaptiveEntitlementApiResult> {
  const stripeEmailFallback = options?.stripeEmailFallback === true;
  let stripeEmailSyncAttempted = false;
  let stripeEmailSyncRecovered = false;

  const normalized = rawEmail ? normalizeBillingEmail(rawEmail) : null;
  if (!normalized) {
    logAdaptiveEntitlement("resolve_skip", { reason: "missing_or_invalid_billing_email", stripeEmailFallback });
    return {
      entitled: false,
      reason: "missing_or_invalid_billing_email",
      planId: "free",
      subscriptionStatus: null,
      entitlementActive: null,
      stripeEmailSyncAttempted,
      stripeEmailSyncRecovered
    };
  }

  let ent = await getAdaptiveEntitlementByEmail(normalized);
  logAdaptiveEntitlement("db_entitlement_lookup", {
    normalizedEmail: normalized,
    rowPresent: Boolean(ent),
    isActive: ent?.isActive ?? false,
    sourceRef: ent?.sourceRef ?? null
  });

  if (ent?.isActive) {
    return {
      entitled: true,
      reason: "adaptive_entitlement_active",
      planId: planIdFromEntitlementMetadata(ent.metadata),
      subscriptionStatus: null,
      entitlementActive: true,
      stripeEmailSyncAttempted,
      stripeEmailSyncRecovered
    };
  }

  if (stripeEmailFallback) {
    stripeEmailSyncAttempted = true;
    logAdaptiveEntitlement("stripe_email_sync_start", { normalizedEmail: normalized });
    const sync = await reconcileAdaptiveEntitlementFromStripeByEmail(normalized);
    stripeEmailSyncRecovered = sync.recovered;
    logAdaptiveEntitlement("stripe_email_sync_done", {
      normalizedEmail: normalized,
      attempted: sync.attempted,
      recovered: sync.recovered,
      skipReason: sync.skipReason ?? null,
      stripeCustomerCount: sync.stripeCustomerCount,
      chosenSubscriptionId: sync.chosenSubscriptionId,
      chosenSubscriptionStatus: sync.chosenSubscriptionStatus,
      subscriptionIdsSample: sync.subscriptionIdsSample,
      errorMessage: sync.errorMessage ?? null
    });

    if (sync.recovered) {
      ent = await getAdaptiveEntitlementByEmail(normalized);
      logAdaptiveEntitlement("db_entitlement_recheck_after_stripe", {
        normalizedEmail: normalized,
        rowPresent: Boolean(ent),
        isActive: ent?.isActive ?? false
      });
      if (ent?.isActive) {
        return {
          entitled: true,
          reason: "adaptive_entitlement_active_after_stripe_sync",
          planId: planIdFromEntitlementMetadata(ent.metadata),
          subscriptionStatus: sync.chosenSubscriptionStatus,
          entitlementActive: true,
          stripeEmailSyncAttempted,
          stripeEmailSyncRecovered
        };
      }
    }
  } else {
    logAdaptiveEntitlement("stripe_email_sync_skipped", {
      normalizedEmail: normalized,
      skipReason: "stripe_email_fallback_disabled"
    });
  }

  return {
    entitled: false,
    reason: "no_active_adaptive_entitlement",
    planId: "free",
    subscriptionStatus: null,
    entitlementActive: ent?.isActive ?? false,
    stripeEmailSyncAttempted,
    stripeEmailSyncRecovered
  };
}
