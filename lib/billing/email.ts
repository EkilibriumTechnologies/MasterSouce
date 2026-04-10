const BILLING_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercase trimmed email suitable for billing keys; returns null if invalid. */
export function normalizeBillingEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!BILLING_EMAIL_REGEX.test(normalized)) return null;
  return normalized;
}
