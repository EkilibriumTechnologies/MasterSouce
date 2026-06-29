import { trackEvent } from "@/lib/analytics/ab-comparison";
import type { PlanId } from "@/lib/subscriptions/types";

export type SongArchitectFunnelEvent =
  | "free_tool_success"
  | "free_tool_upgrade_cta_viewed"
  | "free_tool_upgrade_cta_clicked"
  | "premium_tool_feature_used";

type SongArchitectAnalyticsParams = {
  plan_id?: PlanId;
  source_component?: string;
  page_path?: string;
};

function resolvePagePath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.pathname}${window.location.search || ""}`;
}

export function trackSongArchitectFunnelEvent(
  eventName: SongArchitectFunnelEvent,
  params: SongArchitectAnalyticsParams = {}
): void {
  trackEvent(eventName, {
    source_component: params.source_component ?? "song_architect",
    page_path: params.page_path ?? resolvePagePath(),
    plan_id: params.plan_id
  });
}

export function logSongArchitectFunnelEvent(
  eventName: SongArchitectFunnelEvent,
  details: Record<string, unknown>
): void {
  console.info("[song-architect] funnel_event", {
    event: eventName,
    ...details
  });
}
