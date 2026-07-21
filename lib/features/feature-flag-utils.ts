/**
 * Shared helpers for parsing server-side feature-flag environment values.
 */

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

/**
 * Parse a feature-flag env string into a boolean.
 * Empty, missing, or unrecognized values return `defaultValue`.
 */
export function parseFeatureBoolean(
  value: string | undefined,
  defaultValue: boolean
): boolean {
  if (typeof value !== "string") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return defaultValue;
}
