import { normalizeBillingEmail } from "./email";

let cachedAllowlist: Set<string> | null = null;

function loadAdaptiveBillingAllowlist(): Set<string> {
  if (cachedAllowlist) return cachedAllowlist;
  const raw = process.env.ADAPTIVE_BILLING_ALLOWLIST?.trim() ?? "";
  const entries = raw
    .split(/[,;\s]+/)
    .map((part) => normalizeBillingEmail(part))
    .filter((email): email is string => Boolean(email));
  cachedAllowlist = new Set(entries);
  return cachedAllowlist;
}

export function isAdaptiveBillingAllowlisted(rawEmail: string | null | undefined): boolean {
  const normalized = rawEmail ? normalizeBillingEmail(rawEmail) : null;
  if (!normalized) return false;
  return loadAdaptiveBillingAllowlist().has(normalized);
}
