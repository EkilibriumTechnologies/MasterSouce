import type { MetadataRoute } from "next";

import { getSiteUrlString } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrlString();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"]
    },
    sitemap: `${base}/sitemap.xml`
  };
}
