import { trackEvent } from "@/lib/analytics/ab-comparison";
import type { SubscriptionButtonMetadata } from "@/lib/billing/subscription-button-metadata";

export type SubscriptionButtonClickParams = {
  metadata: SubscriptionButtonMetadata;
  pageLocation?: string;
  sourceComponent?: string;
};

function resolvePageLocation(explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (typeof window === "undefined") return undefined;
  return `${window.location.pathname}${window.location.search || ""}`;
}

export function trackSubscriptionButtonClick({
  metadata,
  pageLocation,
  sourceComponent
}: SubscriptionButtonClickParams): void {
  trackEvent("subscription_button_click", {
    plan_name: metadata.planName,
    plan_tier: metadata.planTier,
    price_id: metadata.priceId,
    price_amount: metadata.priceAmount,
    price_interval: metadata.priceInterval,
    promo_code: metadata.promoCode || undefined,
    page_location: resolvePageLocation(pageLocation),
    source_component: sourceComponent
  });
}
