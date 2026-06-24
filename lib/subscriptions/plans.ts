import { PlanDefinition, PlanId } from "@/lib/subscriptions/types";
import { CREATOR_WAV_DOWNLOADS_PER_MONTH } from "@/lib/usage/download-quota-policy";

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    monthlyMastersLimit: 1,
    songArchitectGenerationsPerMonth: 3,
    quality: "16bit",
    stems: false,
    priority: false,
    apiAccess: false,
    description: "Start free. No credit card. Unlimited MP3 downloads and one WAV export included.",
    features: [
      "Unlimited MP3 downloads",
      "1 free WAV download",
      "All 7 genre presets",
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
    monthlyMastersLimit: CREATOR_WAV_DOWNLOADS_PER_MONTH,
    songArchitectGenerationsPerMonth: 20,
    quality: "24bit",
    stems: true,
    priority: false,
    apiAccess: false,
    description: "For the indie artist releasing consistently.",
    features: [
      "Unlimited MP3 downloads",
      "25 WAV downloads / month",
      "All 7 genre presets",
      "Prompt-Based Adaptive Mastering",
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
    monthlyMastersLimit: null,
    songArchitectGenerationsPerMonth: 50,
    quality: "32bit_float",
    stems: true,
    priority: true,
    apiAccess: true,
    description: "For producers and small labels with volume.",
    features: [
      "Unlimited MP3 downloads",
      "Unlimited WAV downloads",
      "All 7 genre presets",
      "Prompt-Based Adaptive Mastering",
      "A/B preview",
      "WAV 32-bit float",
      "Priority processing"
    ],
    ctaLabel: "Upgrade",
    highlighted: false,
    canUseCustomerPortal: true
  }
};
