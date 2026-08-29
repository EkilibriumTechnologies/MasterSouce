import { trackGaEvent } from "@/lib/analytics/gtag";

export const HIT_ANALYZER_SOURCE_FLOW = "hit_analyzer" as const;

export type HitAnalyzerFunnelEvent =
  | "hit_analyzer_started"
  | "hit_analyzer_succeeded"
  | "hit_analyzer_failed"
  | "hit_analyzer_quota_blocked"
  | "hit_analyzer_post_report_cta_viewed"
  | "hit_analyzer_master_cta_clicked"
  | "hit_analyzer_subscription_cta_clicked";

export type HitAnalyzerFunnelMetadata = {
  source_component?: string;
  plan_id?: string;
  page_path?: string;
  remaining_allowance?: number;
  user_tier?: string;
  result_state?: string;
};

function resolvePagePath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.pathname;
}

/** Client-only, low-cardinality funnel tracking. Analytics must never affect analyzer behavior. */
export function trackHitAnalyzerEvent(
  eventName: HitAnalyzerFunnelEvent,
  params: HitAnalyzerFunnelMetadata = {}
): void {
  try {
    trackGaEvent(eventName, {
      source_flow: HIT_ANALYZER_SOURCE_FLOW,
      source_component: params.source_component ?? "hit_analyzer_page",
      page_path: params.page_path ?? resolvePagePath(),
      plan_id: params.plan_id,
      remaining_allowance: params.remaining_allowance,
      user_tier: params.user_tier,
      result_state: params.result_state
    });
  } catch {
    /* analytics must never block Hit Analyzer behavior */
  }
}
