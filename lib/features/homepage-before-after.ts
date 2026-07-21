/**
 * Homepage Before & After demo feature flag (SERVER-ONLY).
 *
 * The section is temporarily gated until updated samples are generated using
 * the current MasterSauce restoration and mastering pipeline.
 *
 * IMPORTANT — do NOT expose this flag to the client:
 * - The env var is `HOMEPAGE_BEFORE_AFTER_ENABLED` (no `NEXT_PUBLIC_` prefix).
 * - This module must only be imported from server code (e.g. `app/page.tsx`).
 * - Gate rendering on the server so the client demo component never mounts
 *   (and never loads sample audio) when disabled.
 *
 * Defaults to false when unset or unrecognized.
 */

import { parseFeatureBoolean } from "@/lib/features/feature-flag-utils";

/** Server environment variable that controls the homepage Before & After demo. */
export const HOMEPAGE_BEFORE_AFTER_ENABLED_ENV_VAR = "HOMEPAGE_BEFORE_AFTER_ENABLED" as const;

/**
 * Whether the homepage Before & After audio comparison section should render.
 * Default: false (hidden until updated samples are ready).
 */
export function isHomepageBeforeAfterEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return parseFeatureBoolean(env[HOMEPAGE_BEFORE_AFTER_ENABLED_ENV_VAR], false);
}
