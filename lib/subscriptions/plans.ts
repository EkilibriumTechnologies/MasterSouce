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
    description: "Start free. No credit card. Unlimited MP3 downloads and one WAV export per month included.",
    features: [
      "2 Analyze Your Song analyses — lifetime",
      "Master Readiness",
      "3 Song Architect Blueprints / month",
      "All 7 genre presets",
      "Unlimited MP3 downloads",
      "1 WAV download / month",
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
      "5 Analyze Your Song analyses / month",
      "Master Readiness",
      "20 Song Architect Blueprints / month",
      "Advanced Song Architect output",
      "All 7 genre presets",
      "Adaptive customization + exports",
      "Unlimited A/B previews",
      "Unlimited MP3 downloads",
      "25 WAV downloads / month",
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
      "5 Analyze Your Song analyses / month",
      "Master Readiness",
      "50 Song Architect Blueprints / month",
      "Advanced Song Architect output",
      "All 7 genre presets",
      "Adaptive customization + exports",
      "Priority processing",
      "Unlimited A/B previews",
      "Unlimited MP3 downloads",
      "Unlimited WAV downloads",
      "WAV 32-bit float"
    ],
    ctaLabel: "Upgrade",
    highlighted: false,
    canUseCustomerPortal: true
  }
};
