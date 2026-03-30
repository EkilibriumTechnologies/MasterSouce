import { PlanDefinition, PlanId } from "@/lib/subscriptions/types";

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    includedDownloadsPerMonth: 4,
    description: "Start free and pay only when you need more output.",
    features: [
      "Full track mastering",
      "Stream-ready result",
      "A/B preview before download",
      "4 downloads / month"
    ],
    ctaLabel: "Current plan",
    highlighted: false,
    canUseCustomerPortal: false
  },
  creator_monthly: {
    id: "creator_monthly",
    name: "Pro",
    monthlyPriceUsd: 12,
    includedDownloadsPerMonth: 20,
    description: "Faster workflow for frequent creators.",
    features: [
      "20 downloads / month",
      "Faster workflow for frequent creators",
      "Priority access to future premium mastering features",
      "Best for independent artists and creators"
    ],
    ctaLabel: "Upgrade",
    highlighted: true,
    canUseCustomerPortal: true
  },
  creator_yearly: {
    id: "creator_yearly",
    name: "Studio",
    monthlyPriceUsd: 29,
    includedDownloadsPerMonth: 100,
    description: "Built for high-volume creators.",
    features: [
      "100 downloads / month",
      "Built for high-volume creators",
      "Priority access to future pro tools",
      "Best for producers, teams, and catalogs"
    ],
    ctaLabel: "Upgrade",
    highlighted: false,
    canUseCustomerPortal: true
  }
};
