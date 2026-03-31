import type { MetadataRoute } from "next";

import { getSiteUrlString } from "@/lib/site";

/** Public indexable routes only — no `/api` or auth-gated app shells. */
const PATHS = ["/", "/about", "/pricing", "/terms", "/privacy", "/contact"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrlString();
  const lastModified = new Date();

  return PATHS.map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7
  }));
}
