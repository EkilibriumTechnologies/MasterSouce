export type AbVersion = "original" | "mastered";

export type AbEventParams = {
  genre?: string;
  genre_preset?: string;
  loudness_mode?: string;
  mastering_mode?: string;
  selected_preset?: string;
  selected_style?: string;
  target_lufs?: number | null;
  version?: AbVersion;
  format?: "mp3" | "wav";
  job_id?: string;
  file_id?: string;
  plan_id?: string;
  plan_name?: string;
  plan_tier?: string;
  price_id?: string;
  price_amount?: string;
  price_interval?: string;
  promo_code?: string;
  page_location?: string;
  playback_position_seconds?: number;
  playback_percent?: number;
  source_component?: string;
  source_flow?: string;
  page_path?: string;
  timestamp?: string;
  debug_mode?: boolean;
  has_active_subscription?: boolean;
  has_credit_balance?: boolean;
  credit_balance?: number;
  export_quality?: string;
  gate_reason?: string;
  error_code?: string;
};

function resolvePagePath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.pathname}${window.location.search || ""}`;
}

function hasUrlDebugParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("ga_debug") === "1";
}

function hasStoredDebugFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("ms_ga_debug") === "1";
  } catch {
    return false;
  }
}

function bootstrapDebug(): void {
  if (typeof window === "undefined") return;
  const urlDebug = hasUrlDebugParam();
  if (urlDebug) {
    try {
      window.localStorage.setItem("ms_ga_debug", "1");
    } catch {
      /* ignore storage errors */
    }
  }
  window.__msTrackTest = () =>
    trackEvent("test_manual_event", {
      source_component: "manual_test",
      page_path: window.location.pathname
    });
}

export function trackEvent(eventName: string, params: AbEventParams = {}): void {
  bootstrapDebug();
  const debugMode = hasUrlDebugParam() || hasStoredDebugFlag();
  const payload = Object.fromEntries(
    Object.entries({
      ...params,
      ...(debugMode ? { debug_mode: true } : {})
    }).filter(([, value]) => value !== undefined)
  ) as Record<string, string | number | boolean | null>;

  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", eventName, payload);
    if (process.env.NODE_ENV === "production" && hasUrlDebugParam()) {
      console.debug("[MS_GA4_EVENT]", eventName, payload);
    }
  }
}

export function trackAbEvent(eventName: string, params: AbEventParams = {}): void {
  trackEvent(eventName, {
    source_component: "ab_comparison",
    page_path: resolvePagePath(),
    timestamp: new Date().toISOString(),
    ...params
  });
}
