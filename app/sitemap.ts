import type { MetadataRoute } from "next";

import { getSiteUrlString } from "@/lib/site";

/** Public indexable routes only — no `/api` or auth-gated app shells. */
const PATHS = [
  "/",
  "/about",
  "/pricing",
  "/song-architect",
  "/terms",
  "/privacy",
  "/contact",
  "/learn",
  "/learn/streaming-ready-master",
  "/learn/ai-music-still-needs-mastering"
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrlString();
  const lastModified = new Date();

  return PATHS.map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority:
      path === "/"
        ? 1
        : path.startsWith("/learn")
          ? 0.65
          : 0.7
  }));
}
