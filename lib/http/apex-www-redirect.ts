/** Public hostnames for MasterSauce. Canonical traffic is always www. */
export const APEX_PUBLIC_HOST = "mastersauce.ai";
export const CANONICAL_PUBLIC_HOST = "www.mastersauce.ai";

function firstHeaderValue(value: string | null): string {
  if (!value) {
    return "";
  }
  return value.split(",")[0]?.trim() ?? "";
}

export function hostnameFromHeader(value: string | null): string {
  return firstHeaderValue(value).split(":")[0]?.trim().toLowerCase() ?? "";
}

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost")
  );
}

function isKnownPublicHost(hostname: string): boolean {
  return hostname === APEX_PUBLIC_HOST || hostname === CANONICAL_PUBLIC_HOST;
}

/**
 * Resolve the public hostname behind Railway/proxies.
 * Prefer a trustworthy `x-forwarded-host` (apex or www only); otherwise Host.
 * Local/dev Host and www Host win so localhost and www never loop.
 */
export function resolveRequestHostname(
  hostHeader: string | null,
  forwardedHostHeader: string | null = null
): string {
  const host = hostnameFromHeader(hostHeader);
  if (isLocalDevHost(host) || host === CANONICAL_PUBLIC_HOST) {
    return host;
  }

  const forwarded = hostnameFromHeader(forwardedHostHeader);
  if (isKnownPublicHost(forwarded)) {
    return forwarded;
  }

  return host;
}

/**
 * If the public hostname is the apex, return a permanent www URL that keeps
 * pathname and query string (including fbclid / utm_*). Otherwise return null.
 */
export function apexToWwwRedirectUrl(
  hostHeader: string | null,
  requestUrl: string | URL,
  forwardedHostHeader: string | null = null
): URL | null {
  const hostname = resolveRequestHostname(hostHeader, forwardedHostHeader);
  if (hostname !== APEX_PUBLIC_HOST) {
    return null;
  }

  const next = new URL(requestUrl);
  next.hostname = CANONICAL_PUBLIC_HOST;
  next.protocol = "https:";
  next.port = "";
  return next;
}
