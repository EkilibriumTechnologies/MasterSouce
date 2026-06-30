import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "MasterSauce Hit Analyzer | A&R-Style Release Readiness Report",
  description:
    "Get a professional A&R-style report for your song. It does not predict hits — it evaluates hook strength, production quality, replay value, playlist fit, and commercial readiness.",
  path: "/ar-ai",
  absoluteTitle: true
});

export default function ArAiLayout({ children }: { children: ReactNode }) {
  return children;
}
