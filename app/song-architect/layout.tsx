import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Suno Song Architect | Prompts, Lyrics & Song Structure | MasterSauce",
  description:
    "Build better Suno songs before you generate. Create structured lyrics, hooks, energy curves, vocal direction, genre guidance, and ready-to-use generation prompts.",
  path: "/song-architect",
  absoluteTitle: true
});

export default function SongArchitectLayout({ children }: { children: ReactNode }) {
  return children;
}
