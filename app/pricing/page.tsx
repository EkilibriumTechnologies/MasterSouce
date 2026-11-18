import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";

import { SitePrimaryNav } from "@/components/navigation/site-primary-nav";
import { PricingSection } from "@/components/pricing-section";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

import { PricingBottomHomeLink } from "./pricing-home-links";

export const metadata: Metadata = buildPageMetadata({
  title: "Pricing | MasterSauce Plans",
  description:
    "Compare Free, Creator, and Pro Studio plans for Analyze Your Song, Song Architect, native full-song generation, adaptive mastering, and professional WAV exports.",
  path: "/pricing",
  absoluteTitle: true
});

export default function PricingPage() {
  return (
    <main style={mainStyle}>
      <SitePrimaryNav />
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
