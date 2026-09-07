import Script from "next/script";

import { GOOGLE_ADS_TAG_ID } from "@/lib/analytics/gtag";

/**
 * Registers Google Ads on the existing gtag/dataLayer from `GoogleAnalytics`.
 * Does not load a second gtag.js library and does not send a duplicate js init command.
 */
export function GoogleAdsGtagConfig() {
  return (
    <Script
      id="google-ads-gtag-config"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `window.dataLayer=window.dataLayer||[];if(typeof gtag!=='function'){window.gtag=function(){window.dataLayer.push(arguments);}}gtag('config','${GOOGLE_ADS_TAG_ID}');`
      }}
    />
  );
}
