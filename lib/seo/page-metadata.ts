import type { Metadata } from "next";

import { SOCIAL_PREVIEW_ALT, SOCIAL_PREVIEW_SIZE } from "@/lib/og/social-preview";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

/** Default Open Graph / Twitter card image (same dark branded asset as the homepage). */
export const DEFAULT_SOCIAL_PREVIEW_PATH = "/og-image.png";

export type PageMetaInput = {
  /** Shorter segment for `title.template` (e.g. "About", "Privacy Policy") */
  title: string;
  description: string;
  /** Path including leading slash, e.g. "/about" */
  path: string;
  /** When true, use the title verbatim (skips root `title.template`). */
  absoluteTitle?: boolean;
  /** Set true only for pages that must not be indexed */
  noIndex?: boolean;
  /** Public path for og:image / twitter:image; defaults to homepage social preview. */
  socialImagePath?: string;
};

/**
 * Page-level metadata with canonical, Open Graph, and Twitter defaults.
 * Relies on root `metadataBase` and `title.template`.
 */
export function buildPageMetadata({
  title,
  description,
  path,
  absoluteTitle,
  noIndex,
  socialImagePath = DEFAULT_SOCIAL_PREVIEW_PATH
}: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  const socialTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  const socialImageUrl = absoluteUrl(socialImagePath);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: socialTitle,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
      images: [
        {
          url: socialImageUrl,
          width: SOCIAL_PREVIEW_SIZE.width,
          height: SOCIAL_PREVIEW_SIZE.height,
          alt: SOCIAL_PREVIEW_ALT
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [socialImageUrl]
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {})
  };
}
