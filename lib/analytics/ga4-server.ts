import { isValidGa4ClientId, sanitizeGa4ClientId } from "@/lib/analytics/ga4-client-id";

const MP_COLLECT = "https://www.google-analytics.com/mp/collect";
export const GA4_MP_DEBUG_COLLECT = "https://www.google-analytics.com/debug/mp/collect";

export type Ga4PurchaseItem = {
  itemId?: string;
  itemName: string;
  price: number;
  quantity: number;
};

export type Ga4PurchaseType = "initial_subscription" | "renewal" | "credit_pack";

export type SendGa4PurchaseEventParams = {
  clientId: string;
  transactionId: string;
  value: number;
  currency: string;
  items: Ga4PurchaseItem[];
  purchaseType?: Ga4PurchaseType;
  stripePriceId?: string;
  livemode: boolean;
};

export type Ga4PurchaseMpBody = {
  client_id: string;
  events: Array<{
    name: "purchase";
    params: {
      transaction_id: string;
      value: number;
      currency: string;
      items: Array<{
        item_id?: string;
        item_name: string;
        price: number;
        quantity: number;
      }>;
      purchase_type?: Ga4PurchaseType;
      stripe_price_id?: string;
    };
  }>;
};

function getMeasurementId(): string {
  return (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "").trim();
}

function getApiSecret(): string {
  return (process.env.GA4_MEASUREMENT_API_SECRET ?? "").trim();
}

export function normalizeGa4Currency(currency: string | null | undefined): string | null {
  if (typeof currency !== "string") return null;
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) return null;
  return normalized;
}

export function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function buildGa4PurchaseMpBody(params: SendGa4PurchaseEventParams): Ga4PurchaseMpBody | null {
  const clientId = sanitizeGa4ClientId(params.clientId);
  if (!clientId || !isValidGa4ClientId(clientId)) return null;
  const transactionId = typeof params.transactionId === "string" ? params.transactionId.trim() : "";
  if (!transactionId) return null;
  const currency = normalizeGa4Currency(params.currency);
  if (!currency) return null;
  if (!isFinitePositiveNumber(params.value)) return null;
  if (!Array.isArray(params.items) || params.items.length === 0) return null;

  const items = params.items
    .map((item) => {
      const itemName = typeof item.itemName === "string" ? item.itemName.trim() : "";
      const quantity = typeof item.quantity === "number" && Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0;
      if (!itemName || !isFinitePositiveNumber(item.price) || quantity <= 0) return null;
      const itemId = typeof item.itemId === "string" ? item.itemId.trim() : "";
      return {
        ...(itemId ? { item_id: itemId } : {}),
        item_name: itemName,
        price: item.price,
        quantity
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);

  if (items.length === 0) return null;

  return {
    client_id: clientId,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: transactionId,
          value: params.value,
          currency,
          items,
          ...(params.purchaseType ? { purchase_type: params.purchaseType } : {}),
          ...(params.stripePriceId ? { stripe_price_id: params.stripePriceId } : {})
        }
      }
    ]
  };
}

function redactSecrets(message: string): string {
  return message.replace(/api_secret=[^&\s]+/gi, "api_secret=REDACTED");
}

function skipReason(params: SendGa4PurchaseEventParams): string | null {
  if (params.livemode !== true) return "test_mode";
  if (!sanitizeGa4ClientId(params.clientId)) return "invalid_client_id";
  if (!getMeasurementId()) return "missing_measurement_id";
  if (!getApiSecret()) return "missing_api_secret";
  if (!buildGa4PurchaseMpBody(params)) return "invalid_payload";
  return null;
}

/**
 * Server-side GA4 Measurement Protocol `purchase` event.
 * Secrets stay on the server (`GA4_MEASUREMENT_API_SECRET`); the browser only needs `NEXT_PUBLIC_GA_MEASUREMENT_ID` for gtag.
 * Never throws — analytics must not break Stripe webhook processing.
 */
export async function sendGa4PurchaseEvent(params: SendGa4PurchaseEventParams): Promise<void> {
  try {
    const reason = skipReason(params);
    if (reason) {
      console.warn("[GA4_PURCHASE] skipped", {
        reason,
        transactionId: params.transactionId,
        hasMeasurementId: Boolean(getMeasurementId()),
        hasApiSecret: Boolean(getApiSecret()),
        livemode: params.livemode === true
      });
      return;
    }

    const body = buildGa4PurchaseMpBody(params);
    if (!body) return;

    const url = new URL(MP_COLLECT);
    url.searchParams.set("measurement_id", getMeasurementId());
    url.searchParams.set("api_secret", getApiSecret());

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[GA4_PURCHASE] failed", {
        status: res.status,
        transactionId: params.transactionId,
        bodySnippet: text.slice(0, 500)
      });
      return;
    }
    console.log("[GA4_PURCHASE] sent", {
      transactionId: params.transactionId,
      value: params.value,
      currency: params.currency,
      purchaseType: params.purchaseType ?? null
    });
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err));
    console.warn("[GA4_PURCHASE] failed", { transactionId: params.transactionId, message });
  }
}

export type SendGa4CustomEventParams = {
  clientId: string;
  livemode: boolean;
  name: string;
  params?: Record<string, string | number | boolean>;
};

/** Non-revenue GA4 event. Never throws. */
export async function sendGa4CustomEvent(params: SendGa4CustomEventParams): Promise<void> {
  try {
    if (params.livemode !== true) return;
    const clientId = sanitizeGa4ClientId(params.clientId);
    const measurementId = getMeasurementId();
    const apiSecret = getApiSecret();
    const name = typeof params.name === "string" ? params.name.trim() : "";
    if (!clientId || !measurementId || !apiSecret || !name) return;

    const url = new URL(MP_COLLECT);
    url.searchParams.set("measurement_id", measurementId);
    url.searchParams.set("api_secret", apiSecret);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        events: [{ name, params: params.params ?? {} }]
      })
    });
    if (!res.ok) {
      console.warn("[GA4_EVENT] failed", { status: res.status, name });
    }
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err));
    console.warn("[GA4_EVENT] failed", { name: params.name, message });
  }
}

export type Ga4MpDebugValidationResult = {
  skipped: boolean;
  skipReason?: string;
  status?: number;
  validationMessages: unknown[];
};

/**
 * Posts a purchase payload to the GA4 Measurement Protocol debug endpoint.
 * Used only by local validation scripts. Never logs the API secret.
 */
export async function debugValidateGa4PurchasePayload(
  params: SendGa4PurchaseEventParams
): Promise<Ga4MpDebugValidationResult> {
  const measurementId = getMeasurementId();
  const apiSecret = getApiSecret();
  if (!measurementId || !apiSecret) {
    return { skipped: true, skipReason: "missing_mp_env", validationMessages: [] };
  }
  const body = buildGa4PurchaseMpBody({ ...params, livemode: true });
  if (!body) {
    return { skipped: true, skipReason: "invalid_payload", validationMessages: [] };
  }
  const url = new URL(GA4_MP_DEBUG_COLLECT);
  url.searchParams.set("measurement_id", measurementId);
  url.searchParams.set("api_secret", apiSecret);
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = (await res.json().catch(() => null)) as { validationMessages?: unknown[] } | null;
    return {
      skipped: false,
      status: res.status,
      validationMessages: Array.isArray(json?.validationMessages) ? json.validationMessages : []
    };
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err));
    return { skipped: true, skipReason: `debug_request_failed:${message}`, validationMessages: [] };
  }
}
