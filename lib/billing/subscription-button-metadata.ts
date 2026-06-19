import {
  FATHERS_DAY_PROMO_CODE,
  isFathersDayPromoActive
} from "@/lib/promo/fathers-day-2026";
import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";

export type PaidSubscriptionPlanId = "creator_monthly" | "pro_studio_monthly";

export type SubscriptionPlanTier = "creator" | "pro";

export type SubscriptionButtonMetadata = {
  planName: string;
  planTier: SubscriptionPlanTier;
  priceId: string;
  priceAmount: string;
  priceInterval: "month";
  promoCode: string;
};

const PLAN_TIER_BY_ID: Record<PaidSubscriptionPlanId, SubscriptionPlanTier> = {
  creator_monthly: "creator",
  pro_studio_monthly: "pro"
};

const PLAN_DISPLAY_NAME_BY_ID: Record<PaidSubscriptionPlanId, string> = {
  creator_monthly: "Creator",
  pro_studio_monthly: "Pro"
};

export function getClientStripePriceId(planId: PaidSubscriptionPlanId): string {
  const envKey =
    planId === "creator_monthly"
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_STUDIO_MONTHLY;
  return envKey?.trim() ?? "";
}

export function getSubscriptionPlanMetadata(
  planId: PaidSubscriptionPlanId,
  nowMs: number = Date.now()
): SubscriptionButtonMetadata {
  const plan = PLAN_DEFINITIONS[planId];
  const promoActive = isFathersDayPromoActive(nowMs);
  return {
    planName: PLAN_DISPLAY_NAME_BY_ID[planId],
    planTier: PLAN_TIER_BY_ID[planId],
    priceId: getClientStripePriceId(planId),
    priceAmount: String(plan.monthlyPriceUsd),
    priceInterval: "month",
    promoCode: promoActive ? FATHERS_DAY_PROMO_CODE : ""
  };
}

export function subscriptionButtonDataAttributes(
  metadata: SubscriptionButtonMetadata
): Record<string, string> {
  return {
    "data-plan-name": metadata.planName,
    "data-plan-tier": metadata.planTier,
    "data-price-id": metadata.priceId,
    "data-price-amount": metadata.priceAmount,
    "data-price-interval": metadata.priceInterval,
    "data-promo-code": metadata.promoCode
  };
}
