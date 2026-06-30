import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "MasterSauce A&R AI — Release Readiness Report",
  description:
    "Get a professional A&R-style release readiness report for your song. Evaluates competitive fit within your genre — not hit prediction.",
  path: "/ar-ai"
});

export default function ArAiLayout({ children }: { children: ReactNode }) {
  return children;
}
