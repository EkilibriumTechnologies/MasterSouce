import { PlanDefinition, PlanId } from "@/lib/subscriptions/types";

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    monthlyMastersLimit: 2,
    quality: "16bit",
    stems: false,
    priority: false,
    apiAccess: false,
    description: "Start free. No credit card required.",
    features: [
      "2 masters / month",
      "All 7 genre presets",
      "A/B preview",
      "WAV 16-bit",
      "No watermark"
    ],
    ctaLabel: "Current plan",
    highlighted: false,
    canUseCustomerPortal: false
  },
  creator_monthly: {
    id: "creator_monthly",
    name: "Creator",
    monthlyPriceUsd: 9,
    monthlyMastersLimit: 15,
    quality: "24bit",
    stems: true,
    priority: false,
    apiAccess: false,
    description: "For the indie artist releasing consistently.",
    features: [
      "15 masters / month",
      "All 7 genre presets",
      "A/B preview",
      "WAV 24-bit"
    ],
    ctaLabel: "Upgrade",
    highlighted: true,
    badgeLabel: "Most popular",
    canUseCustomerPortal: true
  },
  pro_studio_monthly: {
    id: "pro_studio_monthly",
    name: "Pro Studio",
    monthlyPriceUsd: 24,
    monthlyMastersLimit: 60,
    quality: "32bit_float",
    stems: true,
    priority: true,
    apiAccess: true,
    description: "For producers and small labels with volume.",
    features: [
      "60 masters / month",
      "All 7 genre presets",
      "A/B preview",
      "WAV 32-bit float",
      "Priority processing"
    ],
    ctaLabel: "Upgrade",
    highlighted: false,
    canUseCustomerPortal: true
  }
};
