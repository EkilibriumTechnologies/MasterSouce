import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const PRODUCT_METRIC_SEED = {
  downloads: 1001,
  previews: 1568,
  prompts: 487
} as const;

export type ProductMetricId = keyof typeof PRODUCT_METRIC_SEED;

export type HomeProductMetrics = Record<ProductMetricId, number>;

const METRIC_IDS: ProductMetricId[] = ["downloads", "previews", "prompts"];

export async function getHomeProductMetrics(): Promise<HomeProductMetrics> {
  if (!isSupabaseConfigured()) {
    return { ...PRODUCT_METRIC_SEED };
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .schema("public")
      .from("product_metrics")
      .select("id,count")
      .in("id", METRIC_IDS);
    if (error || !data) {
      throw error ?? new Error("product_metrics select returned no payload");
    }
    const map = new Map<string, number>();
    for (const row of data) {
      const id = typeof row.id === "string" ? row.id : null;
      const count = typeof row.count === "number" && Number.isFinite(row.count) ? row.count : null;
      if (id && count !== null) map.set(id, count);
    }
    return {
      downloads: map.get("downloads") ?? PRODUCT_METRIC_SEED.downloads,
      previews: map.get("previews") ?? PRODUCT_METRIC_SEED.previews,
      prompts: map.get("prompts") ?? PRODUCT_METRIC_SEED.prompts
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[product-metrics] getHomeProductMetrics failed", { detail });
    return { ...PRODUCT_METRIC_SEED };
  }
}

/**
 * Server-only increment; failures are logged and must not break primary request flows.
 */
export async function incrementProductMetric(metricId: ProductMetricId): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.schema("public").rpc("increment_product_metric", { p_id: metricId });
    if (error) {
      const parts = [error.message, error.code, error.details, error.hint].filter(Boolean);
      console.error("[product-metrics] increment_product_metric RPC failed", { metricId, detail: parts.join(" | ") });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[product-metrics] incrementProductMetric threw", { metricId, detail });
  }
}
