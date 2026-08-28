/**
 * Canonical site URL for metadata, sitemap, and absolute links.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://www.mastersauce.ai).
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

export const SITE_TAGLINE = "Release-ready mastering for modern creators";

/** Default meta description — also used in JSON-LD where a short summary is needed. */
export const SITE_DESCRIPTION =
  "AI mastering and song tools for independent and AI music creators, including Suno creators. Analyze, improve, and master your tracks with preset, prompt-guided, or reference-guided mastering. Free MP3 previews; premium plans unlock HD WAV exports.";

export const LEGAL_CONTACT_EMAIL = "consulting@ekilibriumtechnologies.com";
