import type { Metadata } from "next";
import type { ReactNode } from "react";

import { JsonLd } from "@/components/seo/json-ld";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { getProductWebAppJsonLd } from "@/lib/seo/product-web-app-json-ld";

const title = "AI Song Analyzer & A&R Report | MasterSauce";
const description =
  "Analyze your song with AI for an A&R-style report on hook strength, production quality, replay value, playlist fit, and release readiness. No hit predictions.";
const path = "/ar-ai";

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path,
  absoluteTitle: true
});

export default function ArAiLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <JsonLd
        data={getProductWebAppJsonLd({
          name: "MasterSauce Hit Analyzer",
          description,
          path,
          featureList: [
            "AI-assisted song analysis",
            "A&R-style release readiness report",
            "Hook, arrangement, and replay-value feedback",
            "Production quality and playlist-fit feedback",
            "WAV and MP3 upload"
          ]
        })}
      />
      {children}
    </>
  );
}
