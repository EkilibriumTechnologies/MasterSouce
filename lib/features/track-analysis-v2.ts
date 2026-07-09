/**
 * TrackAnalysisV2 server-side feature flag (SERVER-ONLY).
 *
 * TrackAnalysisV2 remains fully implemented, tested, and benchmarked, but its
 * additional FFmpeg subprocesses are expensive, so it is DISABLED BY DEFAULT and
 * only turned on explicitly via a server environment variable.
 *
 * IMPORTANT — do NOT expose this flag to the client:
 * - The env var is `TRACK_ANALYSIS_V2_ENABLED` (no `NEXT_PUBLIC_` prefix), so it
 *   is never inlined into the client bundle.
 * - This module has NO client-safe surface and must only be imported from server
 *   code (route handlers, server modules, tests) — never from `"use client"`
 *   components.
 *
 * This module is intentionally dependency-free (no `next/server`, no auth
 * imports) so the flag contract is pure and unit-testable. The optional
 * owner/admin gate is honored by injecting an `ownerBypassGranted` thunk from the
 * request handler (see {@link resolveTrackAnalysisV2Enablement}); this REUSES the
 * existing `isMasterAdminBypassGranted` helper at the call site and introduces no
 * new authentication mechanism.
 *
 * Modes (parsed from `TRACK_ANALYSIS_V2_ENABLED`, case-insensitive, trimmed):
 * - unset / "" / "false" / "0" / anything unrecognized -> "off"  (default)
 * - "true" / "1" / "yes" / "on"                         -> "on"
 * - "owner" / "admin"                                   -> "owner"
 *     Enabled only for requests where the injected owner bypass is granted.
 */

/** Server environment variable that controls TrackAnalysisV2. Never `NEXT_PUBLIC_`. */
export const TRACK_ANALYSIS_V2_ENV_VAR = "TRACK_ANALYSIS_V2_ENABLED" as const;

export type TrackAnalysisV2FlagMode = "off" | "on" | "owner";

/** Values that fully enable V2 for every request. */
const ON_VALUES = new Set(["true", "1", "yes", "on"]);
/** Values that enable V2 only for owner/admin-bypass requests. */
const OWNER_VALUES = new Set(["owner", "admin"]);

/**
 * Resolve the configured flag mode. Parsing is explicit and safe: any missing,
 * non-string, or unrecognized value resolves to `"off"` (fail-safe default).
 */
export function resolveTrackAnalysisV2Mode(
  env: NodeJS.ProcessEnv = process.env
): TrackAnalysisV2FlagMode {
  const raw = env[TRACK_ANALYSIS_V2_ENV_VAR];
  if (typeof raw !== "string") return "off";
  const normalized = raw.trim().toLowerCase();
  if (ON_VALUES.has(normalized)) return "on";
  if (OWNER_VALUES.has(normalized)) return "owner";
  return "off";
}

/**
 * Whether TrackAnalysisV2 is globally enabled (mode `"on"`).
 *
 * Note: `"owner"` mode is request-scoped and intentionally returns `false` here;
 * use {@link resolveTrackAnalysisV2Enablement} inside a request handler to honor
 * owner-only enablement.
 */
export function isTrackAnalysisV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveTrackAnalysisV2Mode(env) === "on";
}

/**
 * Resolve whether TrackAnalysisV2 should run for the current request.
 * - `"on"`    -> always enabled
 * - `"owner"` -> enabled only when `ownerBypassGranted()` returns true. The thunk
 *                is evaluated lazily (only in owner mode) so no auth work runs on
 *                the default/disabled path.
 * - `"off"`   -> never enabled (default)
 */
export function resolveTrackAnalysisV2Enablement(
  ownerBypassGranted: () => boolean,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const mode = resolveTrackAnalysisV2Mode(env);
  if (mode === "on") return true;
  if (mode === "owner") return ownerBypassGranted();
  return false;
}
