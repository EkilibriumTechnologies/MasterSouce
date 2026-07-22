/**
 * AI Audio Restoration server-side feature flags (SERVER-ONLY).
 *
 * Product-facing name: AI Audio Restoration.
 * Internal engine name: Audio Artifact Restoration.
 *
 * These flags intentionally use non-NEXT_PUBLIC environment variables so raw
 * environment values are never bundled into client code.
 */

import { parseFeatureBoolean } from "@/lib/features/feature-flag-utils";

export const AI_AUDIO_RESTORATION_ENABLED_ENV_VAR = "AI_AUDIO_RESTORATION_ENABLED" as const;
export const AI_AUDIO_RESTORATION_OWNER_ONLY_ENV_VAR = "AI_AUDIO_RESTORATION_OWNER_ONLY" as const;

export type AiAudioRestorationFeatureConfig = {
  enabled: boolean;
  ownerOnly: boolean;
};

export function resolveAiAudioRestorationFeatureConfig(
  env: NodeJS.ProcessEnv = process.env
): AiAudioRestorationFeatureConfig {
  return {
    enabled: parseFeatureBoolean(env[AI_AUDIO_RESTORATION_ENABLED_ENV_VAR], false),
    ownerOnly: parseFeatureBoolean(env[AI_AUDIO_RESTORATION_OWNER_ONLY_ENV_VAR], true)
  };
}

export function isAiAudioRestorationAuthorized(params: {
  config?: AiAudioRestorationFeatureConfig;
  ownerAuthorized: boolean;
}): boolean {
  const config = params.config ?? resolveAiAudioRestorationFeatureConfig();
  if (!config.enabled) return false;
  if (config.ownerOnly) return params.ownerAuthorized;
  return true;
}
