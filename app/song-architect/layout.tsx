import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Song Architect",
  description:
    "Build Suno/Udio-ready song blueprints with structured prompts, hooks, and lyrics. Generate faster and refine before mastering.",
  path: "/song-architect"
});

export default function SongArchitectLayout({ children }: { children: ReactNode }) {
  return children;
}
