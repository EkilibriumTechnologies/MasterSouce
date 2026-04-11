import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import Script from "next/script";
import { ReactNode, Suspense } from "react";

import { GaAppRouterPageViews } from "@/components/analytics/ga-app-router-page-views";
import { SOCIAL_PREVIEW_ALT, SOCIAL_PREVIEW_SIZE } from "@/lib/og/social-preview";
import { absoluteUrl, getSiteUrlString, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

const metadataBaseUrl = getSiteUrlString();

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: metadataBaseUrl }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "music",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1
    }
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: metadataBaseUrl,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: absoluteUrl("/og-image.png"),
        width: SOCIAL_PREVIEW_SIZE.width,
        height: SOCIAL_PREVIEW_SIZE.height,
        alt: SOCIAL_PREVIEW_ALT
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [absoluteUrl("/og-image.png")]
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=ms2", type: "image/x-icon" },
      { url: "/favicon-16x16.png?v=ms2", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png?v=ms2", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png?v=ms2", sizes: "48x48", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png?v=ms2", sizes: "180x180", type: "image/png" }]
  },
  ...(googleVerification
    ? {
        verification: {
          google: googleVerification
        }
      }
    : {})
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b1225" },
    { media: "(prefers-color-scheme: light)", color: "#0f1831" }
  ]
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={bodyStyle}>
        <Script
          src="https://tools.luckyorange.com/core/lo.js?site-id=dfb08ca6"
          strategy="afterInteractive"
        />
        {children}
        {gaMeasurementId ? (
          <>
            <GoogleAnalytics gaId={gaMeasurementId} />
            <Suspense fallback={null}>
              <GaAppRouterPageViews />
            </Suspense>
          </>
        ) : null}
      </body>
    </html>
  );
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  minHeight: "100vh",
  fontFamily: "Work Sans, Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell",
  background:
    "radial-gradient(1200px 420px at 10% -30%, rgba(47, 176, 255, 0.16), rgba(47,176,255,0) 56%), radial-gradient(1000px 540px at 90% -18%, rgba(140, 96, 255, 0.24), rgba(140,96,255,0) 62%), linear-gradient(145deg, #0f1831 0%, #0b1225 54%, #070f20 100%)",
  backgroundImage: "url('/images/home-wave-bg.png')",
  backgroundBlendMode: "overlay",
  color: "#eef2ff",
  lineHeight: 1.5
};
