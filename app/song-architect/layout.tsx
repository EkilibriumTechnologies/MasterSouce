import type { Metadata } from "next";
import type { ReactNode } from "react";

import { JsonLd } from "@/components/seo/json-ld";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { getProductWebAppJsonLd } from "@/lib/seo/product-web-app-json-ld";

const title = "AI Song Structure Generator & Songwriting Planner | MasterSauce";
const description =
  "Plan a song before you generate it. Build structure, lyrics, hooks, energy curves, vocal direction, genre guidance, and prompts for Suno, Udio, and other AI music tools.";
const path = "/song-architect";

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path,
  absoluteTitle: true
});

export default function SongArchitectLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <JsonLd
        data={getProductWebAppJsonLd({
          name: "MasterSauce Song Architect",
          description,
          path,
          featureList: [
            "AI-assisted song structure planning",
            "Lyrics and hook development",
            "Energy curve and vocal direction planning",
            "Genre guidance and generation prompts",
            "Song blueprints for Suno, Udio, and other AI music generators"
          ]
        })}
      />
      {children}
    </>
  );
}
