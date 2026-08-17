import type { SongArchitectCandidateMode } from "@/lib/song-architect/types";

export type CandidateStrategy = {
  mode: SongArchitectCandidateMode;
  requestedCount: 1 | 2;
  parallel: boolean;
  aiCriticEnabled: boolean;
  reason: string;
};

/**
 * Multi-candidate generation is configuration-gated.
 * Default is single_candidate so free traffic is not silently doubled.
 * This does not invent plan/quota/billing rules.
 *
 * SONG_ARCHITECT_CANDIDATE_MODE=single_candidate | multi_candidate
 * SONG_ARCHITECT_AI_CRITIC=1 enables one optional subjective critic call.
 */
export function resolveCandidateStrategy(
  env: NodeJS.ProcessEnv = process.env
): CandidateStrategy {
  const raw = (env.SONG_ARCHITECT_CANDIDATE_MODE ?? "single_candidate").trim().toLowerCase();
  const aiCriticEnabled = env.SONG_ARCHITECT_AI_CRITIC === "1";

  if (raw === "multi" || raw === "multi_candidate") {
    return {
      mode: "multi_candidate",
      requestedCount: 2,
      parallel: true,
      aiCriticEnabled,
      reason: "env_multi_candidate"
    };
  }

  return {
    mode: "single_candidate",
    requestedCount: 1,
    parallel: false,
    aiCriticEnabled,
    reason: "default_cost_safe_single_candidate"
  };
}

export const CANDIDATE_ARCHITECTURE_NOTES = {
  generationShape:
    "Two independent structured calls (same Song DNA, same schema) when multi_candidate is enabled. A single dual-candidate schema was rejected because long songs already hit output-token limits.",
  parallelism:
    "Parallel Promise.allSettled. If one call fails, the surviving candidate is used. Reliability beats forcing both.",
  critic:
    "Deterministic checks always run. Optional AI critic is a single small scoring call and stays off unless SONG_ARCHITECT_AI_CRITIC=1.",
  recommendedActivation:
    "Keep default single_candidate. Enable multi_candidate only after measuring cost. Do not change quotas or invent plan rules here."
} as const;
