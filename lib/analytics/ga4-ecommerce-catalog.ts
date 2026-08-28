export type Ga4EcommerceCatalogId = "creator_monthly" | "pro_studio_monthly" | "credit_pack";

export type Ga4EcommerceCatalogItem = {
  itemId: Ga4EcommerceCatalogId;
  itemName: string;
  /** Catalog display price in major currency units (USD). Purchase events must use Stripe paid amounts instead. */
  price: number;
  currency: "USD";
};

/** Must match `PLAN_DEFINITIONS` / pricing UI. Purchase `value` always comes from Stripe, not this catalog. */
export const CREDIT_PACK_CATALOG_PRICE_USD = 4;

export const GA4_ECOMMERCE_CATALOG: Record<Ga4EcommerceCatalogId, Ga4EcommerceCatalogItem> = {
  creator_monthly: {
    itemId: "creator_monthly",
    itemName: "Creator",
    price: 9,
    currency: "USD"
  },
  pro_studio_monthly: {
    itemId: "pro_studio_monthly",
    itemName: "Pro Studio",
    price: 24,
    currency: "USD"
  },
  credit_pack: {
    itemId: "credit_pack",
    itemName: "MasterSauce Credit Pack",
    price: CREDIT_PACK_CATALOG_PRICE_USD,
    currency: "USD"
  }
};

export function getGa4EcommerceCatalogItem(id: Ga4EcommerceCatalogId): Ga4EcommerceCatalogItem {
  return GA4_ECOMMERCE_CATALOG[id];
}
