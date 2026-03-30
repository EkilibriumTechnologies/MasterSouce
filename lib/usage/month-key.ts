/** UTC `YYYY-MM`, aligned with monthly download / quota periods. */
export function getCurrentMonthKeyUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
