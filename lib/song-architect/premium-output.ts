import { isSongArchitectPremiumPlan } from "@/lib/song-architect/premium-access";
import type {
  SongArchitectOutput,
  SongArchitectPremiumEnhancements,
  SongArchitectResolvedInput
} from "@/lib/song-architect/types";
import type { PlanId } from "@/lib/subscriptions/types";

export type SongArchitectBasicOutput = Pick<SongArchitectOutput, "concept" | "stylePrompt" | "lyrics" | "meta">;

export type SongArchitectClientPayload = {
  basic: SongArchitectBasicOutput;
  premium: SongArchitectPremiumEnhancements | null;
  premiumLocked: boolean;
  planId: PlanId;
};

function buildReferenceArtistGuidance(
  output: SongArchitectOutput,
  resolvedInput?: SongArchitectResolvedInput
): string {
  const artists = resolvedInput?.referenceArtists?.filter(Boolean) ?? [];
  if (artists.length === 0) {
    return `No reference artists supplied. Match the ${output.concept.emotion} mood and ${output.stylePrompt} palette when steering Suno/Udio.`;
  }
  const joined = artists.slice(0, 6).join(", ");
  return [
    `Reference palette: ${joined}.`,
    `Borrow their ${output.concept.emotion} vocal placement and production density — not literal mimicry.`,
    `Keep your hook identity distinct: "${output.concept.hookIdentity}".`
  ].join(" ");
}

function buildMasteringReadyPrompt(output: SongArchitectOutput): string {
  return [
    "MasterSauce mastering prep (paste after Suno/Udio export):",
    `Style target: ${output.stylePrompt}`,
    `Energy arc: ${output.concept.energyCurve}`,
    `Hook anchor: ${output.concept.hookIdentity}`,
    `Structure: ${output.concept.structure}`,
    "Export WAV from your AI DAW, then master on MasterSauce with a genre preset aligned to the style prompt."
  ].join("\n");
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
    stylePrompt: full.stylePrompt,
    lyrics: full.lyrics,
    meta: full.meta
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
