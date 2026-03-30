import type { CSSProperties } from "react";

import { PricingSection } from "@/components/pricing-section";

import { PricingBottomHomeLink, PricingTopHomeLink } from "./pricing-home-links";

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
