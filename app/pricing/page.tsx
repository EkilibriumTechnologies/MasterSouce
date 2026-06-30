import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";

import { MasterSauceBrandNav } from "@/components/brand/mastersauce-brand-header";
import { PricingSection } from "@/components/pricing-section";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

import { PricingBottomHomeLink } from "./pricing-home-links";

export const metadata: Metadata = buildPageMetadata({
  title: "Pricing | MasterSauce Plans",
  description:
    "Compare Free, Creator, and Pro Studio plans. Preview masters freely, export WAV when ready, and unlock adaptive customization, reference-guided mastering, and premium tools.",
  path: "/pricing",
  absoluteTitle: true
});

export default function PricingPage() {
  return (
    <main style={mainStyle}>
      <MasterSauceBrandNav backHref="/" backLabel="← Back to Home" />
      <Suspense fallback={null}>
        <PricingSection />
      </Suspense>
      <PricingBottomHomeLink />
    </main>
  );
}

const mainStyle: CSSProperties = {
  maxWidth: "1080px",
  margin: "0 auto",
  padding: "24px 20px 60px"
};
