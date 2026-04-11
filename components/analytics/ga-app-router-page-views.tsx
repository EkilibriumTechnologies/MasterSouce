"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { GA_MEASUREMENT_ID } from "@/lib/analytics/gtag";

/** Virtual page views for client-side navigations (initial hit is handled by GoogleAnalytics). */
export function GaAppRouterPageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const skipInitial = useRef(true);

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    const q = searchParams?.toString();
    const pagePath = q ? `${pathname}?${q}` : pathname;

    if (skipInitial.current) {
      skipInitial.current = false;
      return;
    }

    window.gtag?.("config", GA_MEASUREMENT_ID, { page_path: pagePath });
  }, [pathname, searchParams]);

  return null;
}
