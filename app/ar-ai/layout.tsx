import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "MasterSauce Hit Analyzer | A&R-Style Release Readiness Report",
  description:
    "Professional A&R-style release readiness report based on audio analysis, commercial songwriting principles, and streaming behavior — not hit prediction.",
  path: "/ar-ai",
  absoluteTitle: true
});

export default function ArAiLayout({ children }: { children: ReactNode }) {
  return children;
}
