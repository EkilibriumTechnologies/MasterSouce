/**
 * GA4 measurement ID (e.g. G-XXXXXXXXXX). Set NEXT_PUBLIC_GA_MEASUREMENT_ID in production.
 * Events are no-ops until the ID exists and gtag is loaded.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

/** Names reserved for future implementation — use with `trackGaEvent` when wiring UI. */
export const GaEvents = {
  UPLOAD_STARTED: "upload_started",
  MASTERING_COMPLETED: "mastering_completed",
  PREVIEW_PLAYED: "preview_played",
  EMAIL_SUBMITTED: "email_submitted",
  DOWNLOAD_CLICKED: "download_clicked",
  UPGRADE_CLICKED: "upgrade_clicked"
} as const;

export type GaEventName = (typeof GaEvents)[keyof typeof GaEvents];

export function trackGaEvent(
  eventName: GaEventName | string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  if (typeof window === "undefined" || !GA_MEASUREMENT_ID) return;
  const payload = Object.fromEntries(
    Object.entries(params ?? {}).filter(([, v]) => v !== undefined)
  ) as Record<string, string | number | boolean>;
  window.gtag?.("event", eventName, payload);
}
