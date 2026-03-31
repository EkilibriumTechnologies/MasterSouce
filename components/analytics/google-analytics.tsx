"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { GA_MEASUREMENT_ID } from "@/lib/analytics/gtag";

function GaRouteReporter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || typeof window === "undefined") return;
    const q = searchParams?.toString();
    const pagePath = q ? `${pathname}?${q}` : pathname;
    window.gtag?.("config", GA_MEASUREMENT_ID, { page_path: pagePath });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Loads GA4 only when NEXT_PUBLIC_GA_ID is set. Sends virtual page views on App Router navigations.
 */
export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `.trim()}
      </Script>
      <Suspense fallback={null}>
        <GaRouteReporter />
      </Suspense>
    </>
  );
}
