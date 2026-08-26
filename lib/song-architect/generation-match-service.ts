import type { TrackAnalysis } from "@/lib/audio/analyze-track";
import type { TrackAnalysisV2Summary } from "@/lib/audio/track-analysis-v2-types";
import { evaluateGenerationMatch } from "@/lib/song-architect/generation-match";
import {
  hasUsableGenerationMatchAnalysis,
  trackAnalysisToGenerationMatchEvidence
} from "@/lib/song-architect/generation-match-evidence";
import {
  buildImprovedGenerationPrompt,
  toPublicGenerationMatchResult,
  type PublicGenerationMatchResponse
} from "@/lib/song-architect/generation-match-public";
import type { SongDNA } from "@/lib/song-architect/types";

export type GenerationMatchEvaluationError = {
  ok: false;
  code: "analysis_failed" | "generation_match_failed";
  message: string;
};

export type RunGenerationMatchFromTrackAnalysisInput = {
  songDNA: SongDNA;
  analysis: TrackAnalysis;
  analysisV2?: TrackAnalysisV2Summary | null;
  stylePrompt?: string;
  sunoBlueprint?: string;
  evaluatedAt?: string;
};

/**
 * Server-side Generation Match integration.
 *
 * Song DNA is treated as read-only. Analysis must already have been produced by
 * the existing Track Analysis pipeline — client-provided analysis is never used
 * at the route boundary.
 */
export function runGenerationMatchFromTrackAnalysis(
  input: RunGenerationMatchFromTrackAnalysisInput
): { ok: true; response: PublicGenerationMatchResponse } | GenerationMatchEvaluationError {
  if (!hasUsableGenerationMatchAnalysis(input.analysis)) {
    return {
      ok: false,
      code: "analysis_failed",
      message: "The generated track could not be analyzed. Please upload a WAV or MP3 export and try again."
    };
  }

  const songDNASnapshot = structuredClone(input.songDNA);

  try {
    const result = evaluateGenerationMatch({
      songDNA: songDNASnapshot,
      analysis: trackAnalysisToGenerationMatchEvidence({
        analysis: input.analysis,
        analysisV2: input.analysisV2
      }),
      evaluatedAt: input.evaluatedAt
    });
    const match = toPublicGenerationMatchResult(result);
    return {
      ok: true,
      response: {
        match,
        improvedGenerationPrompt: buildImprovedGenerationPrompt({
          stylePrompt: input.stylePrompt ?? "",
          sunoBlueprint: input.sunoBlueprint,
          correctionPlan: match.correctionPlan
        })
      }
    };
  } catch {
    return {
      ok: false,
      code: "generation_match_failed",
      message: "Generation Match could not be completed for this track."
    };
  }
}
