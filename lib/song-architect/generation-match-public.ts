import type {
  GenerationCorrectionPlan,
  GenerationMatchDimension,
  GenerationMatchLevel,
  GenerationMatchResult
} from "@/lib/song-architect/generation-match-types";

export type PublicGenerationMatchResult = {
  overall: GenerationMatchLevel;
  dimensions: GenerationMatchDimension[];
  matched: string[];
  partial: string[];
  missed: string[];
  notEvaluated: string[];
  correctionDirections: string[];
  correctionPlan: GenerationCorrectionPlan;
  evaluatedAt: string;
  evidenceCounts: GenerationMatchResult["evidenceCounts"];
};

export type PublicGenerationMatchResponse = {
  match: PublicGenerationMatchResult;
  improvedGenerationPrompt: string | null;
};

const PUBLIC_OVERALL: ReadonlySet<GenerationMatchLevel> = new Set(["high", "medium", "low", "not_evaluable"]);

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function sanitizeDimension(dimension: GenerationMatchDimension): GenerationMatchDimension {
  return {
    id: dimension.id,
    label: dimension.label,
    ...(dimension.intended !== undefined ? { intended: dimension.intended } : {}),
    ...(dimension.observed !== undefined ? { observed: dimension.observed } : {}),
    status: dimension.status,
    confidence: dimension.confidence,
    ...(dimension.inferenceConfidence ? { inferenceConfidence: dimension.inferenceConfidence } : {}),
    evidenceSource: dimension.evidenceSource,
    explanation: dimension.explanation
  };
}

/**
 * Strip evaluator-internal fields (including the coarse internalScore) before
 * returning a result to the browser. Never attach prompts or diagnostics.
 */
export function toPublicGenerationMatchResult(result: GenerationMatchResult): PublicGenerationMatchResult {
  const overall = PUBLIC_OVERALL.has(result.overall) ? result.overall : "not_evaluable";
  return {
    overall,
    dimensions: result.dimensions.map(sanitizeDimension),
    matched: asStringArray(result.matched),
    partial: asStringArray(result.partial),
    missed: asStringArray(result.missed),
    notEvaluated: asStringArray(result.notEvaluated),
    correctionDirections: asStringArray(result.correctionDirections),
    correctionPlan: {
      preserve: asStringArray(result.correctionPlan?.preserve),
      change: asStringArray(result.correctionPlan?.change)
    },
    evaluatedAt: typeof result.evaluatedAt === "string" && result.evaluatedAt ? result.evaluatedAt : new Date().toISOString(),
    evidenceCounts: {
      measured: Number.isFinite(result.evidenceCounts?.measured) ? result.evidenceCounts.measured : 0,
      inferred: Number.isFinite(result.evidenceCounts?.inferred) ? result.evidenceCounts.inferred : 0,
      notEvaluable: Number.isFinite(result.evidenceCounts?.notEvaluable) ? result.evidenceCounts.notEvaluable : 0
    }
  };
}

/**
 * Display-only next-generation prompt. Uses the already-compiled Song Architect
 * prompts plus Generation Match correction directions. Does not mutate Song DNA
 * and does not re-run Song Architect generation.
 */
export function buildImprovedGenerationPrompt(input: {
  stylePrompt: string;
  sunoBlueprint?: string;
  correctionPlan: GenerationCorrectionPlan;
}): string | null {
  const change = asStringArray(input.correctionPlan.change);
  if (change.length === 0) return null;

  const stylePrompt = input.stylePrompt.trim();
  const blueprint = input.sunoBlueprint?.trim() ?? "";
  const preserve = asStringArray(input.correctionPlan.preserve);
  const lines = [
    stylePrompt || null,
    blueprint && blueprint !== stylePrompt ? `Blueprint: ${blueprint}` : null,
    "",
    "Next generation notes (keep the original Song DNA; adjust only the mismatches):",
    ...preserve.map((item) => `Keep ${item}.`),
    ...change.map((item) => `Change: ${item}.`)
  ].filter((line): line is string => line !== null);

  const text = lines.join("\n").trim();
  return text || null;
}
