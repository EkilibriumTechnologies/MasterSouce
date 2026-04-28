import { trackGaEvent } from "@/lib/analytics/gtag";

export type AbVersion = "original" | "mastered";

type AbEventParams = {
  version?: AbVersion;
  track_id?: string;
  job_id?: string;
  file_id?: string;
  session_id?: string;
  plan_id?: string;
  playback_position_seconds?: number;
  playback_percent?: number;
  source_component?: "ab_comparison";
  page_path?: string;
  timestamp?: string;
};

function resolvePagePath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.pathname}${window.location.search || ""}`;
}

export function trackAbEvent(eventName: string, params: AbEventParams = {}): void {
  trackGaEvent(eventName, {
    source_component: "ab_comparison",
    page_path: resolvePagePath(),
    timestamp: new Date().toISOString(),
    ...params
  });
}
