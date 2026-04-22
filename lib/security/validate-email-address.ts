export type EmailValidationResult = {
  allowed: boolean;
  reason?:
    | "invalid_format"
    | "blocked_domain"
    | "disposable_domain"
    | "suspicious_local_part";
  normalizedEmail?: string;
};

const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BLOCKED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "invalid.com",
  "localhost"
]);

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "sharklasers.com",
  "dispostable.com",
  "throwawaymail.com"
]);

const SUSPICIOUS_LOCAL_PREFIXES = ["burn-", "test-", "fake-", "temp-", "header-auth"] as const;

function domainMatches(domain: string, blocked: Set<string>): boolean {
  for (const blockedDomain of blocked) {
    if (domain === blockedDomain || domain.endsWith(`.${blockedDomain}`)) {
      return true;
    }
  }
  return false;
}

function hasSuspiciousLocalPart(localPart: string): boolean {
  if (SUSPICIOUS_LOCAL_PREFIXES.some((prefix) => localPart.startsWith(prefix))) {
    return true;
  }

  if (/^\d+$/.test(localPart)) {
    return true;
  }

  if (localPart.length > 40) {
    return true;
  }

  // Bot-like numeric suffixes, e.g. name-00000000
  if (/\d{8,}$/.test(localPart)) {
    return true;
  }

  // Randomized token-style locals often used by abuse scripts.
  if (localPart.length >= 24 && /^[a-z0-9]+$/.test(localPart)) {
    const digitCount = (localPart.match(/\d/g) ?? []).length;
    const letterCount = (localPart.match(/[a-z]/g) ?? []).length;
    if (digitCount >= 8 && letterCount >= 8) {
      return true;
    }
  }

  return false;
}

export function validateEmailAddress(rawEmail: string): EmailValidationResult {
  const normalizedEmail = rawEmail.trim().toLowerCase();
  if (!normalizedEmail || !BASIC_EMAIL_REGEX.test(normalizedEmail)) {
    return { allowed: false, reason: "invalid_format" };
  }

  const [localPart, domain] = normalizedEmail.split("@");
  if (!localPart || !domain) {
    return { allowed: false, reason: "invalid_format" };
  }

  if (domainMatches(domain, BLOCKED_DOMAINS)) {
    return { allowed: false, reason: "blocked_domain" };
  }

  if (domainMatches(domain, DISPOSABLE_DOMAINS)) {
    return { allowed: false, reason: "disposable_domain" };
  }

  if (hasSuspiciousLocalPart(localPart)) {
    return { allowed: false, reason: "suspicious_local_part" };
  }

  return { allowed: true, normalizedEmail };
}
