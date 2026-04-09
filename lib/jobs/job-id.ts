import { randomBytes } from "node:crypto";

/**
 * Generates readable, collision-resistant job identifiers.
 * Format: `${prefix}_${timestampBase36}_${hexSuffix}`.
 */
export function createJobId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const suffix = randomBytes(6).toString("hex");
  return `${prefix}_${timestamp}_${suffix}`;
}
