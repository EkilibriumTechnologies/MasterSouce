import { GA_MEASUREMENT_ID } from "@/lib/analytics/gtag";

const MP_COLLECT = "https://www.google-analytics.com/mp/collect";

export type Ga4PurchaseItem = {
  itemId?: string;
  itemName: string;
  price: number;
  quantity: number;
};

export type SendGa4PurchaseEventParams = {
  clientId: string;
  transactionId: string;
  value: number;
  currency: string;
  items: Ga4PurchaseItem[];
};

function getMeasurementId(): string {
  return GA_MEASUREMENT_ID.trim();
}

function getApiSecret(): string {
  return (process.env.GA4_MEASUREMENT_API_SECRET ?? "").trim();
}

/**
 * Server-side GA4 Measurement Protocol `purchase` event.
 * Secrets stay on the server (`GA4_MEASUREMENT_API_SECRET`); the browser only needs `NEXT_PUBLIC_GA_MEASUREMENT_ID` for gtag.
 */
export async function sendGa4PurchaseEvent(params: SendGa4PurchaseEventParams): Promise<void> {
  const measurementId = getMeasurementId();
  const apiSecret = getApiSecret();
  if (!measurementId || !apiSecret) {
    console.warn("[GA4_PURCHASE] skipped_missing_env", {
      hasMeasurementId: Boolean(measurementId),
      hasApiSecret: Boolean(apiSecret)
    });
    return;
  }

  const url = new URL(MP_COLLECT);
  url.searchParams.set("measurement_id", measurementId);
  url.searchParams.set("api_secret", apiSecret);

  const body = {
    client_id: params.clientId,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: params.transactionId,
          value: params.value,
          currency: params.currency.toUpperCase(),
          items: params.items.map((i) => ({
            ...(i.itemId ? { item_id: i.itemId } : {}),
            item_name: i.itemName,
            price: i.price,
            quantity: i.quantity
          }))
        }
      }
    ]
  };

  try {
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
    console.log("[GA4_PURCHASE] sent", { transactionId: params.transactionId, value: params.value, currency: params.currency });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[GA4_PURCHASE] failed", { transactionId: params.transactionId, message });
  }
}
