import type { SongDNA } from "@/lib/song-architect/types";
import type {
  EvaluateGenerationMatchInput,
  GenerationInferenceConfidence,
  GenerationMatchAnalysisEvidence,
  GenerationMatchDimension,
  GenerationMatchEvidenceSource,
  GenerationMatchResult,
  GenerationMatchStatus
} from "@/lib/song-architect/generation-match-types";

type ScoredDimension = {
  dimension: GenerationMatchDimension;
  score: number;
  weight: number;
  preserve?: string;
  change?: string;
};

const STATUS_SCORE: Record<Exclude<GenerationMatchStatus, "not_evaluable">, number> = {
  matched: 1,
  partial: 0.55,
  missed: 0
};

const INFERENCE_WEIGHT: Record<GenerationInferenceConfidence, number> = {
  high: 0.65,
  medium: 0.4,
  low: 0.2
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function text(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ").toLowerCase();
}

function statusFromDistance(distance: number, matched: number, partial: number): GenerationMatchStatus {
  if (distance <= matched) return "matched";
  if (distance <= partial) return "partial";
  return "missed";
}

function sourceOr(
  source: GenerationMatchEvidenceSource | undefined,
  fallback: GenerationMatchEvidenceSource
): GenerationMatchEvidenceSource {
  return source ?? fallback;
}

function measuredDimension(args: {
  id: string;
  label: string;
  intended: string | number;
  observed: string | number;
  status: Exclude<GenerationMatchStatus, "not_evaluable">;
  source: GenerationMatchEvidenceSource;
  explanation: string;
  weight: number;
  preserve?: string;
  change?: string;
}): ScoredDimension {
  return {
    dimension: {
      id: args.id,
      label: args.label,
      intended: args.intended,
      observed: args.observed,
      status: args.status,
      confidence: "measured",
      evidenceSource: args.source,
      explanation: args.explanation
    },
    score: STATUS_SCORE[args.status],
    weight: args.weight,
    preserve: args.preserve,
    change: args.change
  };
}

function inferredDimension(args: {
  id: string;
  label: string;
  intended: string | number;
  observed: string | number;
  status: Exclude<GenerationMatchStatus, "not_evaluable">;
  inferenceConfidence: GenerationInferenceConfidence;
  source: GenerationMatchEvidenceSource;
  explanation: string;
  weight: number;
  preserve?: string;
  change?: string;
}): ScoredDimension {
  return {
    dimension: {
      id: args.id,
      label: args.label,
      intended: args.intended,
      observed: args.observed,
      status: args.status,
      confidence: "inferred",
      inferenceConfidence: args.inferenceConfidence,
      evidenceSource: args.source,
      explanation: args.explanation
    },
    score: STATUS_SCORE[args.status],
    weight: args.weight * INFERENCE_WEIGHT[args.inferenceConfidence],
    preserve: args.preserve,
    change: args.change
  };
}

function unavailableDimension(id: string, label: string, intended: string, explanation: string): ScoredDimension {
  return {
    dimension: {
      id,
      label,
      intended,
      status: "not_evaluable",
      confidence: "inferred",
      inferenceConfidence: "low",
      evidenceSource: "unavailable",
      explanation
    },
    score: 0,
    weight: 0
  };
}

function intendedTempo(songDNA: SongDNA): number | null {
  if (finite(songDNA.sonic.bpm)) return songDNA.sonic.bpm;
  if (finite(songDNA.sonic.bpmRange?.min) && finite(songDNA.sonic.bpmRange?.max)) {
    return (songDNA.sonic.bpmRange.min + songDNA.sonic.bpmRange.max) / 2;
  }
  return null;
}

/**
 * Returns the smallest relative error after considering direct, half-time, and
 * double-time interpretations. No arbitrary neighboring tempo is considered.
 */
export function normalizedTempoDifference(intendedBpm: number, observedBpm: number): {
  relativeError: number;
  normalizedObservedBpm: number;
  relationship: "direct" | "half_time" | "double_time";
} {
  const candidates = [
    { normalized: observedBpm, relationship: "direct" as const },
    { normalized: observedBpm / 2, relationship: "double_time" as const },
    { normalized: observedBpm * 2, relationship: "half_time" as const }
  ];
  return candidates
    .map((candidate) => ({
      relativeError: Math.abs(candidate.normalized - intendedBpm) / intendedBpm,
      normalizedObservedBpm: candidate.normalized,
      relationship: candidate.relationship
    }))
    .sort((a, b) => a.relativeError - b.relativeError)[0];
}

function evaluateTempo(songDNA: SongDNA, analysis: GenerationMatchAnalysisEvidence): ScoredDimension | null {
  const intended = intendedTempo(songDNA);
  if (intended === null) return null;
  const tempoEvidence = analysis.tempo;
  const observed = tempoEvidence?.bpm;
  if (!finite(observed) || observed <= 0) {
    return unavailableDimension(
      "tempo",
      "Tempo",
      `${Math.round(intended)} BPM`,
      "Tempo was not evaluated because the current production Track Analysis pipeline does not measure BPM."
    );
  }

  const normalized = normalizedTempoDifference(intended, observed);
  const status = statusFromDistance(normalized.relativeError, 0.03, 0.08) as Exclude<
    GenerationMatchStatus,
    "not_evaluable"
  >;
  const relationship =
    normalized.relationship === "direct"
      ? ""
      : ` after ${normalized.relationship === "double_time" ? "double-time" : "half-time"} normalization`;

  return measuredDimension({
    id: "tempo",
    label: "Tempo",
    intended: `${Math.round(intended)} BPM`,
    observed: `${Math.round(observed)} BPM`,
    status,
    source: sourceOr(tempoEvidence?.source, "provided_analysis"),
    explanation:
      status === "matched"
        ? `The measured pulse closely matches the intended tempo${relationship}.`
        : status === "partial"
          ? `The measured pulse is near the intended tempo${relationship}, but the difference is noticeable.`
          : "The measured pulse is materially different from the intended tempo, including plausible half/double-time interpretations.",
    weight: 1.35,
    preserve: `the ${Math.round(intended)} BPM pulse`,
    change: `return the pulse closer to ${Math.round(intended)} BPM`
  });
}

function resample(values: number[], length: number): number[] {
  if (length <= 0 || values.length === 0) return [];
  if (values.length === length) return [...values];
  if (length === 1) return [values[0]];
  return Array.from({ length }, (_, index) => {
    const sourceIndex = (index / (length - 1)) * (values.length - 1);
    const low = Math.floor(sourceIndex);
    const high = Math.min(values.length - 1, Math.ceil(sourceIndex));
    const mix = sourceIndex - low;
    return values[low] * (1 - mix) + values[high] * mix;
  });
}

function evaluateEnergy(songDNA: SongDNA, analysis: GenerationMatchAnalysisEvidence): ScoredDimension | null {
  const intended = (songDNA.arrangement?.sections ?? [])
    .map((section) => section.energy)
    .filter(finite);
  if (intended.length < 2) return null;
  const observed = analysis.sectionEnergy?.values.filter(finite).map((value) => Math.min(10, Math.max(1, value))) ?? [];
  if (observed.length < 2 || !analysis.sectionEnergy) {
    return unavailableDimension(
      "energy_arc",
      "Energy arc",
      intended.map((value) => Math.round(value)).join(" → "),
      "Section-level energy was not evaluated because current Track Analysis has no reliable section segmentation."
    );
  }

  const aligned = resample(observed, intended.length);
  const meanError =
    intended.reduce((sum, value, index) => sum + Math.abs(value - aligned[index]), 0) / intended.length;
  const intendedContrast = Math.max(...intended) - Math.min(...intended);
  const observedContrast = Math.max(...aligned) - Math.min(...aligned);
  const contrastError = Math.abs(intendedContrast - observedContrast);
  const combinedError = meanError * 0.65 + contrastError * 0.35;
  const status = statusFromDistance(combinedError, 1.15, 2.5) as Exclude<
    GenerationMatchStatus,
    "not_evaluable"
  >;

  return inferredDimension({
    id: "energy_arc",
    label: "Energy arc",
    intended: intended.map((value) => Math.round(value)).join(" → "),
    observed: aligned.map((value) => Math.round(value)).join(" → "),
    status,
    inferenceConfidence: analysis.sectionEnergy.confidence,
    source: sourceOr(analysis.sectionEnergy.source, "inferred"),
    explanation:
      status === "matched"
        ? "The coarse observed energy shape follows the intended arrangement arc."
        : status === "partial"
          ? "The generated track follows part of the intended energy arc, but its section contrast is weaker or shifted."
          : "The coarse observed energy shape does not reproduce the intended verse/payoff contrast.",
    weight: 1.15,
    preserve: "the current section-to-section energy arc",
    change: "increase the intended section contrast without changing matched tempo or tone"
  });
}

type DynamicsClass = "open" | "controlled";

function intendedDynamics(songDNA: SongDNA): DynamicsClass | null {
  const value = text(songDNA.sonic.dynamics);
  if (!value) return null;
  if (/\bnatural dynamics?\b|\bwide dynamics?\b|\bbreath|\bopen|\bgradual|\bpatient|\bsparse/.test(value)) {
    return "open";
  }
  if (/\btight|\bcontrolled|\bpunch|\bcompressed|\bdense|\bcrush/.test(value)) return "controlled";
  return null;
}

function evaluateDynamics(songDNA: SongDNA, analysis: GenerationMatchAnalysisEvidence): ScoredDimension | null {
  const intended = intendedDynamics(songDNA);
  if (!intended) return null;
  const v2Crest = analysis.v2?.crestFactorDb;
  const v2Lra = analysis.v2?.loudnessRangeLu;
  const hasV2 = finite(v2Crest) || finite(v2Lra);
  const crest = finite(v2Crest) ? v2Crest : finite(analysis.v1?.crestDb) ? analysis.v1.crestDb : null;
  const lra = finite(v2Lra) ? v2Lra : null;
  if (crest === null && lra === null) {
    return unavailableDimension("dynamics", "Dynamics", intended, "No reliable crest or loudness-range evidence was available.");
  }

  const observed: DynamicsClass =
    (crest !== null && crest >= 8) || (lra !== null && lra >= 6) ? "open" : "controlled";
  const close =
    intended === observed ||
    (intended === "open" && ((crest !== null && crest >= 7) || (lra !== null && lra >= 4)));
  const status: "matched" | "partial" = intended === observed ? "matched" : close ? "partial" : "partial";

  return measuredDimension({
    id: "dynamics",
    label: "Global dynamics",
    intended,
    observed: `${observed}${crest !== null ? ` (${crest.toFixed(1)} dB crest)` : ""}`,
    status,
    source: hasV2 ? "track_analysis_v2" : "track_analysis_v1",
    explanation:
      status === "matched"
        ? `Global dynamic behavior is consistent with the intended ${intended} presentation.`
        : `Global dynamics are ${observed}, while the blueprint calls for a more ${intended} presentation. This does not measure section arrangement energy.`,
    weight: 0.9,
    preserve: `the ${intended} global dynamic behavior`,
    change: `make the global dynamics feel more ${intended} while preserving the arrangement`
  });
}

type TonalClass = "dark" | "balanced" | "bright";

function intendedTone(songDNA: SongDNA): TonalClass | null {
  const value = text(
    songDNA.sonic.productionAesthetic,
    songDNA.sonic.emotionalSonicExpression,
    songDNA.sonic.ambience,
    songDNA.sonic.distortionSaturation
  );
  if (/\bdark|\bnocturnal|\bwarm|\bshadow|\bmuted|\bfiltered/.test(value)) return "dark";
  if (/\bbright|\bcrisp|\bairy|\bbrilliant|\bshimmer|\bopen top/.test(value)) return "bright";
  return null;
}

function observedTone(analysis: GenerationMatchAnalysisEvidence): {
  value: TonalClass;
  detail: string;
  source: GenerationMatchEvidenceSource;
} | null {
  if (finite(analysis.v2?.spectralSlopeDbPerOct)) {
    const slope = analysis.v2.spectralSlopeDbPerOct;
    return {
      value: slope <= -3 ? "dark" : slope >= -1 ? "bright" : "balanced",
      detail: `${slope.toFixed(1)} dB/oct spectral slope`,
      source: "track_analysis_v2"
    };
  }
  if (finite(analysis.v2?.spectralCentroidHz)) {
    const centroid = analysis.v2.spectralCentroidHz;
    return {
      value: centroid < 1400 ? "dark" : centroid > 2800 ? "bright" : "balanced",
      detail: `${Math.round(centroid)} Hz spectral centroid`,
      source: "track_analysis_v2"
    };
  }
  if (finite(analysis.v1?.harshnessDb) && finite(analysis.v1?.lowMidDb)) {
    const delta = analysis.v1.harshnessDb - analysis.v1.lowMidDb;
    return {
      value: delta < -2 ? "dark" : delta > 4 ? "bright" : "balanced",
      detail: `${delta.toFixed(1)} dB presence-to-low-mid balance`,
      source: "track_analysis_v1"
    };
  }
  return null;
}

function evaluateTone(songDNA: SongDNA, analysis: GenerationMatchAnalysisEvidence): ScoredDimension | null {
  const intended = intendedTone(songDNA);
  if (!intended) return null;
  const observed = observedTone(analysis);
  if (!observed) {
    return unavailableDimension("tonal_character", "Tonal character", intended, "No usable spectral evidence was available.");
  }
  const status: "matched" | "partial" | "missed" =
    intended === observed.value ? "matched" : observed.value === "balanced" ? "partial" : "missed";
  return measuredDimension({
    id: "tonal_character",
    label: "Tonal character",
    intended,
    observed: `${observed.value} (${observed.detail})`,
    status,
    source: observed.source,
    explanation:
      status === "matched"
        ? `The broad spectral balance supports the intended ${intended} character.`
        : status === "partial"
          ? `The broad spectral balance is neutral compared with the intended ${intended} character.`
          : `The broad spectral balance reads ${observed.value}, not ${intended}.`,
    weight: 1,
    preserve: `the ${intended} tonal balance`,
    change: `shift the production toward a ${intended} tonal balance`
  });
}

type LowEndClass = "heavy" | "balanced" | "lean";

function intendedLowEnd(songDNA: SongDNA): LowEndClass | null {
  const value = text(songDNA.sonic.bassCharacter, songDNA.sonic.productionAesthetic);
  if (/\bsub[- ]?heavy|\bheavy|\bfull weight|\bweighty|\b808|\bdeep bass|\bround bass/.test(value)) return "heavy";
  if (/\blean|\bthin|\btucked|\bunderstated|\breduced bass/.test(value)) return "lean";
  return null;
}

function observedLowEnd(analysis: GenerationMatchAnalysisEvidence): {
  value: LowEndClass;
  source: GenerationMatchEvidenceSource;
} | null {
  if (Array.isArray(analysis.v2?.activeFlags)) {
    if (analysis.v2.activeFlags.includes("low_end_excess")) return { value: "heavy", source: "track_analysis_v2" };
    if (analysis.v2.activeFlags.includes("low_end_weak")) return { value: "lean", source: "track_analysis_v2" };
    return { value: "balanced", source: "track_analysis_v2" };
  }
  if (finite(analysis.v1?.lowEndDb) && finite(analysis.v1?.lowMidDb)) {
    const delta = analysis.v1.lowEndDb - analysis.v1.lowMidDb;
    return {
      value: delta >= 3.5 ? "heavy" : delta <= -3.5 ? "lean" : "balanced",
      source: "track_analysis_v1"
    };
  }
  return null;
}

function evaluateLowEnd(songDNA: SongDNA, analysis: GenerationMatchAnalysisEvidence): ScoredDimension | null {
  const intended = intendedLowEnd(songDNA);
  if (!intended) return null;
  const observed = observedLowEnd(analysis);
  if (!observed) return unavailableDimension("low_end", "Low-end weight", intended, "No usable low-end evidence was available.");
  const status: "matched" | "partial" | "missed" =
    intended === observed.value ? "matched" : observed.value === "balanced" ? "partial" : "missed";
  return measuredDimension({
    id: "low_end",
    label: "Low-end weight",
    intended,
    observed: observed.value,
    status,
    source: observed.source,
    explanation:
      status === "matched"
        ? `Measured low-end balance is consistent with the intended ${intended} weight.`
        : status === "partial"
          ? `Low-end balance is more neutral than the intended ${intended} weight.`
          : `Low-end balance is ${observed.value}, while the blueprint calls for ${intended} weight.`,
    weight: 0.8,
    preserve: `the ${intended} low-end weight`,
    change: `adjust low-end weight toward ${intended} without changing the matched tonal identity`
  });
}

type WidthClass = "narrow" | "moderate" | "wide";

function widthClass(value: number): WidthClass {
  if (value < 0.28) return "narrow";
  if (value >= 0.55) return "wide";
  return "moderate";
}

function intendedGlobalWidth(songDNA: SongDNA): WidthClass | null {
  const value = text(songDNA.sonic.spatialCharacter, songDNA.sonic.ambience);
  if (/\bnarrow|\bcentered|\bclose|\bintimate|\bdry/.test(value)) return "narrow";
  if (/\bwide|\bbroad|\bexpansive|\blarge room|\bopen image/.test(value)) return "wide";
  return null;
}

function evaluateStereo(songDNA: SongDNA, analysis: GenerationMatchAnalysisEvidence): ScoredDimension | null {
  const intendedSections = songDNA.arrangement?.sections ?? [];
  const intendedSectionWidth: number[] = intendedSections.map((section) =>
    /\bwidest|\bwide|\bopen|\bexpan/.test(section.spatialDirection?.toLowerCase() ?? "") ? 1 :
      /\bnarrow|\bclose|\bcenter/.test(section.spatialDirection?.toLowerCase() ?? "") ? 0 : 0.5
  );
  const observedSections = analysis.sectionStereoWidth?.values.filter(finite) ?? [];

  if (intendedSections.length >= 2 && observedSections.length >= 2 && analysis.sectionStereoWidth) {
    const aligned = resample(observedSections, intendedSectionWidth.length);
    const meanError =
      intendedSectionWidth.reduce((sum, value, index) => sum + Math.abs(value - aligned[index]), 0) /
      intendedSectionWidth.length;
    const status = statusFromDistance(meanError, 0.18, 0.38) as Exclude<GenerationMatchStatus, "not_evaluable">;
    return inferredDimension({
      id: "section_stereo",
      label: "Section width contrast",
      intended: "section-specific width arc",
      observed: "coarse section width arc",
      status,
      inferenceConfidence: analysis.sectionStereoWidth.confidence,
      source: sourceOr(analysis.sectionStereoWidth.source, "inferred"),
      explanation:
        status === "matched"
          ? "The coarse stereo profile follows the intended section width changes."
          : status === "partial"
            ? "Stereo width changes in the intended direction, but the contrast is modest."
            : "The observed stereo profile does not create the intended section width contrast.",
      weight: 0.85,
      preserve: "the current section width movement",
      change: "increase width only in the intended payoff sections"
    });
  }

  const intended = intendedGlobalWidth(songDNA);
  if (intended && finite(analysis.v2?.stereoWidthRatio)) {
    const observed = widthClass(analysis.v2.stereoWidthRatio);
    const status: "matched" | "partial" | "missed" =
      intended === observed ? "matched" : observed === "moderate" ? "partial" : "missed";
    return measuredDimension({
      id: "global_stereo",
      label: "Global stereo space",
      intended,
      observed: `${observed} (${analysis.v2.stereoWidthRatio.toFixed(2)} side/mid ratio)`,
      status,
      source: "track_analysis_v2",
      explanation:
        status === "matched"
          ? `Global stereo width supports the intended ${intended} production.`
          : `Global stereo width is ${observed}, while the blueprint broadly suggests ${intended}. This does not prove section-level width.`,
      weight: 0.75,
      preserve: `the ${intended} global stereo image`,
      change: `move the global stereo image toward ${intended}`
    });
  }

  const hasSectionIntent = intendedSections.some((section) => Boolean(section.spatialDirection));
  if (hasSectionIntent) {
    return unavailableDimension(
      "section_stereo",
      "Section width contrast",
      "section-specific spatial directions",
      "Only global stereo evidence is available, so verse/chorus width contrast was not evaluated."
    );
  }
  return null;
}

function evaluateVocal(songDNA: SongDNA): ScoredDimension | null {
  const intended = text(
    songDNA.sonic.vocalRegister,
    songDNA.sonic.vocalTexture,
    songDNA.sonic.vocalDelivery,
    songDNA.composition.vocalStyle
  ).trim();
  if (!intended) return null;
  return unavailableDimension(
    "vocal_character",
    "Vocal character",
    intended,
    "Vocal register, timbre, and delivery were not evaluated because no reliable vocal-isolation or vocal-feature evidence exists."
  );
}

function evaluateHarmony(songDNA: SongDNA): ScoredDimension | null {
  const harmony = songDNA.harmony;
  if (!harmony) return null;
  const intended = text(harmony.scaleOrMode, harmony.modeTendency, harmony.harmonicCharacter).trim();
  if (!intended) return null;
  return unavailableDimension(
    "harmony",
    "Harmony",
    intended,
    "Harmony was not evaluated because current Track Analysis does not provide reliable key, mode, or chord transcription."
  );
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/**
 * Compare intended Song DNA with existing/provided analysis evidence.
 *
 * Weighting policy:
 * - measured dimensions retain their full base weight;
 * - inferred dimensions are discounted by high=.65, medium=.40, low=.20;
 * - unavailable dimensions have zero weight;
 * - the denominator is the sum of evaluable weights, so missing capabilities
 *   never reduce a track's result.
 */
export function evaluateGenerationMatch(input: EvaluateGenerationMatchInput): GenerationMatchResult {
  const candidates = [
    evaluateTempo(input.songDNA, input.analysis),
    evaluateEnergy(input.songDNA, input.analysis),
    evaluateDynamics(input.songDNA, input.analysis),
    evaluateTone(input.songDNA, input.analysis),
    evaluateLowEnd(input.songDNA, input.analysis),
    evaluateStereo(input.songDNA, input.analysis),
    evaluateVocal(input.songDNA),
    evaluateHarmony(input.songDNA)
  ].filter((value): value is ScoredDimension => value !== null);

  const evaluable = candidates.filter((entry) => entry.dimension.status !== "not_evaluable" && entry.weight > 0);
  const totalWeight = evaluable.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedScore =
    totalWeight > 0
      ? evaluable.reduce((sum, entry) => sum + entry.score * entry.weight, 0) / totalWeight
      : 0;
  const internalScore = Math.round(weightedScore * 100);
  const overall =
    totalWeight === 0 ? "not_evaluable" : internalScore >= 78 ? "high" : internalScore >= 45 ? "medium" : "low";
  const dimensions = candidates.map((entry) => entry.dimension);

  const explanations = (status: GenerationMatchStatus) =>
    dimensions.filter((dimension) => dimension.status === status).map((dimension) => dimension.explanation);
  const preserve = unique(
    candidates
      .filter((entry) => entry.dimension.status === "matched")
      .map((entry) => entry.preserve ?? `preserve ${entry.dimension.label.toLowerCase()}`)
  );
  const change = unique(
    candidates
      .filter((entry) => entry.dimension.status === "partial" || entry.dimension.status === "missed")
      .map((entry) => entry.change ?? `adjust ${entry.dimension.label.toLowerCase()}`)
  );

  return {
    overall,
    dimensions,
    matched: explanations("matched"),
    partial: explanations("partial"),
    missed: explanations("missed"),
    notEvaluated: explanations("not_evaluable"),
    correctionDirections: change,
    correctionPlan: { preserve, change },
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    evidenceCounts: {
      measured: dimensions.filter(
        (dimension) => dimension.status !== "not_evaluable" && dimension.confidence === "measured"
      ).length,
      inferred: dimensions.filter(
        (dimension) => dimension.status !== "not_evaluable" && dimension.confidence === "inferred"
      ).length,
      notEvaluable: dimensions.filter((dimension) => dimension.status === "not_evaluable").length
    },
    internalScore
  };
}
