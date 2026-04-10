export function isAdaptiveDevBypassEnabled(): boolean {
  const raw = process.env.ADAPTIVE_DEV_BYPASS?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
