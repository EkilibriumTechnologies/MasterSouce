import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Song Architect | Improve Lyrics, Hooks, and Song Structure",
  description:
    "Turn rough ideas, lyrics, and song concepts into stronger, more structured songs. Build hooks, refine structure, and shape release-ready blueprints for Suno and Udio.",
  path: "/song-architect",
  absoluteTitle: true
});

export default function SongArchitectLayout({ children }: { children: ReactNode }) {
  return children;
}
