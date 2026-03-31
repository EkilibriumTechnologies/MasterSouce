/**
 * Canonical site URL for metadata, sitemap, and absolute links.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://mastersauce.app).
 * Falls back to NEXT_PUBLIC_APP_URL (Stripe redirects), then VERCEL_URL, then localhost.
 */
export function getSiteUrlString(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/^\/+/, "")}` : "") ||
    "http://localhost:3000";
  const normalized = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  return normalized.replace(/\/+$/, "");
}

export function getSiteUrl(): URL {
  return new URL(getSiteUrlString());
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrlString();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export const SITE_NAME = "MasterSauce";

export const SITE_TAGLINE = "Automatic mastering for modern music creators";

/** Default meta description — also used in JSON-LD where a short summary is needed. */
export const SITE_DESCRIPTION =
  "Upload your track, preview a master in seconds, and download the result. Built for independent artists, bedroom producers, and AI music creators who want a polished sound without a complicated workflow.";

export const LEGAL_CONTACT_EMAIL = "consulting@ekilibriumtechnologies.com";
