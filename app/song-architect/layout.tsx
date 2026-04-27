import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Suno Prompt Generator — Song Architect by MasterSauce",
  description:
    "Generate Suno and Udio-ready lyrics, hooks, and style prompts in seconds. Pick a preset or build your own direction — free to try.",
  path: "/song-architect"
});

export default function SongArchitectLayout({ children }: { children: ReactNode }) {
  return children;
}
