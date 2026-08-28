/**
 * GA4 Measurement Protocol `client_id` sanitization.
 * A real gtag client_id looks like `{random}.{timestamp}` (e.g. `1234567890.1699999999`).
 * Stripe ids and synthetic checkout tokens are not valid GA identifiers.
 */

export const GA4_CLIENT_ID_METADATA_KEY = "ga_client_id";

const GA4_CLIENT_ID_RE = /^[0-9]{1,20}\.[0-9]{1,20}$/;

const REJECTED_PREFIXES = [
  "cus_",
  "cs_",
  "in_",
  "sub_",
  "si_",
  "pi_",
  "evt_",
  "price_",
  "prod_",
  "stripe_"
] as const;

export function isValidGa4ClientId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return false;
  const lower = trimmed.toLowerCase();
  if (REJECTED_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false;
  if (lower.includes("stripe")) return false;
  return GA4_CLIENT_ID_RE.test(trimmed);
}

/** Returns a sanitized GA4 client_id, or null when the value must not be sent to Measurement Protocol. */
export function sanitizeGa4ClientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!isValidGa4ClientId(trimmed)) return null;
  return trimmed;
}
