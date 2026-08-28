import { sanitizeGa4ClientId } from "@/lib/analytics/ga4-client-id";
import {
  getGa4EcommerceCatalogItem,
  type Ga4EcommerceCatalogId
} from "@/lib/analytics/ga4-ecommerce-catalog";

/**
 * GA4 measurement ID (e.g. G-XXXXXXXXXX). Set NEXT_PUBLIC_GA_MEASUREMENT_ID in production.
 * Events are no-ops until the ID exists and gtag is loaded.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

function getBrowserMeasurementId(): string {
  return GA_MEASUREMENT_ID || (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "").trim();
}

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

/** Resolves GA4 `client_id` for Measurement Protocol / Stripe metadata (non-blocking). */
export function getGaClientId(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const measurementId = getBrowserMeasurementId();
      if (typeof window === "undefined" || !measurementId) {
        resolve(null);
        return;
      }
      const gtag = window.gtag;
      if (typeof gtag !== "function") {
        resolve(null);
        return;
      }
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const t = window.setTimeout(() => finish(null), 2000);
      try {
        gtag("get", measurementId, "client_id", (id: unknown) => {
          window.clearTimeout(t);
          finish(sanitizeGa4ClientId(id));
        });
      } catch {
        window.clearTimeout(t);
        finish(null);
      }
    } catch {
      resolve(null);
    }
  });
}

/**
 * GA4 ecommerce `begin_checkout`. Never throws and never blocks checkout.
 * Catalog prices are for funnel items only — purchase value always comes from Stripe.
 */
export function trackGa4BeginCheckout(catalogId: Ga4EcommerceCatalogId): void {
  try {
    if (typeof window === "undefined" || !getBrowserMeasurementId()) return;
    const item = getGa4EcommerceCatalogItem(catalogId);
    window.gtag?.("event", "begin_checkout", {
      currency: item.currency,
      value: item.price,
      items: [
        {
          item_id: item.itemId,
          item_name: item.itemName,
          price: item.price,
          quantity: 1
        }
      ]
    });
  } catch {
    /* analytics must never block checkout */
  }
}

/** Resolves a catalog id for begin_checkout without throwing. */
export function resolveBeginCheckoutCatalogId(input: {
  kind?: string;
  planId?: string | null;
}): Ga4EcommerceCatalogId | null {
  try {
    if (input.kind === "credit_pack" || input.planId === "credit_pack") return "credit_pack";
    if (input.planId === "creator_monthly" || input.planId === "pro_studio_monthly") return input.planId;
    return null;
  } catch {
    return null;
  }
}
