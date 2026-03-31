import type { Metadata } from "next";

import { SITE_NAME, absoluteUrl } from "@/lib/site";

export type PageMetaInput = {
  /** Shorter segment for `title.template` (e.g. "About", "Privacy Policy") */
  title: string;
  description: string;
  /** Path including leading slash, e.g. "/about" */
  path: string;
  /** Set true only for pages that must not be indexed */
  noIndex?: boolean;
};

/**
 * Page-level metadata with canonical, Open Graph, and Twitter defaults.
 * Relies on root `metadataBase` and `title.template`.
 */
export function buildPageMetadata({ title, description, path, noIndex }: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US"
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {})
  };
}
