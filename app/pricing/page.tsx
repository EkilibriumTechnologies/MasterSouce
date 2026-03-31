import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { PricingSection } from "@/components/pricing-section";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

import { PricingBottomHomeLink, PricingTopHomeLink } from "./pricing-home-links";

export const metadata: Metadata = buildPageMetadata({
  title: "Pricing",
  description:
    "Simple plans for MasterSauce: preview freely, pay for final masters when you are ready. Manage your subscription or credit packs here.",
  path: "/pricing"
});

export default function PricingPage() {
  return (
    <main style={mainStyle}>
      <PricingTopHomeLink />
      <PricingSection />
      <PricingBottomHomeLink />
    </main>
  );
}

const mainStyle: CSSProperties = {
  maxWidth: "1080px",
  margin: "0 auto",
  padding: "24px 20px 60px"
};
