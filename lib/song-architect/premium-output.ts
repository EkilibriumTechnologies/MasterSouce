import { isSongArchitectPremiumPlan } from "@/lib/song-architect/premium-access";
import type {
  SongArchitectOutput,
  SongArchitectPremiumEnhancements,
  SongArchitectResolvedInput,
  SongArchitectSelectionPresentation
} from "@/lib/song-architect/types";
import type { PlanId } from "@/lib/subscriptions/types";

export type SongArchitectBasicOutput = Pick<
  SongArchitectOutput,
  "concept" | "songDNA" | "stylePrompt" | "sunoBlueprint" | "lyrics" | "generationOptimizedLyrics" | "meta"
> & {
  selection?: SongArchitectSelectionPresentation;
};

export type SongArchitectClientPayload = {
  basic: SongArchitectBasicOutput;
  premium: SongArchitectPremiumEnhancements | null;
  premiumLocked: boolean;
  planId: PlanId;
};

function buildReferenceArtistGuidance(
  output: SongArchitectOutput,
  _resolvedInput?: SongArchitectResolvedInput
): string {
  const reference = output.songDNA.reference;
  if (!reference || reference.sources.length === 0) {
    return `No references supplied. Match the ${output.concept.emotion} mood and ${output.stylePrompt} palette when steering Suno/Udio.`;
  }
  return [
    reference.influenceSummary,
    `Keep your hook identity distinct: "${output.concept.hookIdentity}".`,
    "Steer from the resolved sonic direction, not literal artist imitation."
  ].join(" ");
}

function buildMasteringReadyPrompt(output: SongArchitectOutput): string {
  const sonic = output.songDNA.sonic;
  return [
    "MasterSauce mastering prep (paste after Suno/Udio export):",
    `Style target: ${output.stylePrompt}`,
    `Energy arc: ${output.concept.energyCurve}`,
    sonic.emotionalSonicExpression ? `Sonic expression: ${sonic.emotionalSonicExpression}` : null,
    sonic.primaryGenre ? `Genre: ${sonic.primaryGenre}` : null,
    typeof sonic.bpm === "number" ? `BPM: ${sonic.bpm}` : null,
    `Hook anchor: ${output.concept.hookIdentity}`,
    `Structure: ${output.concept.structure}`,
    "Export WAV from your AI DAW, then master on MasterSauce with a genre preset aligned to the style prompt."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildExportMasteringGuidance(output: SongArchitectOutput): string {
  const notes = output.performanceNotes.slice(0, 4);
  const noteBlock = notes.length > 0 ? notes.map((note) => `- ${note}`).join("\n") : "- Keep verses dry; widen chorus width.";
  return [
    "Export + mastering checklist:",
    noteBlock,
    "",
    "Suno/Udio export prompt (full):",
    output.exportPrompt.slice(0, 1200)
  ].join("\n");
}

function deriveStyleDirections(output: SongArchitectOutput): [string, string, string] {
  const hooks = output.altHooks.filter(Boolean);
  const fallback: [string, string, string] = [
    `${output.concept.emotion}-forward: ${output.stylePrompt}`,
    `Hook-led: center on "${output.concept.hookIdentity}" with ${output.concept.energyCurve}`,
    `Contrast arc: ${output.concept.angle} — ${output.concept.structure}`
  ];
  return [hooks[0] ?? fallback[0], hooks[1] ?? fallback[1], hooks[2] ?? fallback[2]];
}

export function buildSongArchitectPremiumEnhancements(
  output: SongArchitectOutput,
  resolvedInput?: SongArchitectResolvedInput
): SongArchitectPremiumEnhancements {
  return {
    diagnostics: output.diagnostics,
    altHooks: output.altHooks,
    performanceNotes: output.performanceNotes,
    exportPrompt: output.exportPrompt,
    masteringReadyPrompt: buildMasteringReadyPrompt(output),
    styleDirections: deriveStyleDirections(output),
    referenceArtistGuidance: buildReferenceArtistGuidance(output, resolvedInput),
    exportMasteringGuidance: buildExportMasteringGuidance(output)
  };
}

export function partitionSongArchitectClientPayload(
  full: SongArchitectOutput,
  planId: PlanId,
  resolvedInput?: SongArchitectResolvedInput
): SongArchitectClientPayload {
  const basic: SongArchitectBasicOutput = {
    concept: full.concept,
    songDNA: full.songDNA,
    stylePrompt: full.stylePrompt,
    sunoBlueprint: full.sunoBlueprint,
    lyrics: full.lyrics,
    generationOptimizedLyrics: full.generationOptimizedLyrics || full.lyrics,
    meta: full.meta,
    ...(full.selection ? { selection: full.selection } : {})
  };

  if (isSongArchitectPremiumPlan(planId)) {
    return {
      basic,
      premium: buildSongArchitectPremiumEnhancements(full, resolvedInput),
      premiumLocked: false,
      planId
    };
  }

  return {
    basic,
    premium: null,
    premiumLocked: true,
    planId
  };
}
