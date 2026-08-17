import { inferArrangementDNA } from "@/lib/song-architect/arrangement-dna";
import {
  GLOBAL_INSTRUCTION_PRIORITY,
  PROMPT_BUDGETS,
  SECTION_INSTRUCTION_PRIORITY,
  applyTotalBlueprintBudget,
  dedupeInstructions,
  filterLocalDeltas,
  isLowValue,
  mergeSelectionStats,
  resolvePromptConflicts,
  selectBudgetedInstructions,
  selectPriorityInstructions,
  tokensOf,
  type InstructionBucket,
  type InstructionSelectionStats,
  type WeightedInstruction
} from "@/lib/song-architect/compiler-budget";
import { listSonicExclusionItems } from "@/lib/song-architect/sonic-exclusions";
import type {
  ArrangementDNA,
  CompilerStrategyId,
  HarmonyDNA,
  InstructionSource,
  SectionProductionDirection,
  SongArchitectConcept,
  SongDNA,
  SongDNAGenreFamily,
  SonicDNA
} from "@/lib/song-architect/types";

export {
  GLOBAL_INSTRUCTION_PRIORITY,
  SECTION_INSTRUCTION_PRIORITY,
  dedupeInstructions,
  resolvePromptConflicts,
  selectPriorityInstructions
};
export type { InstructionBucket, WeightedInstruction };

export type SunoCompilerStrategyId = CompilerStrategyId;

export type CompilePromptOptions = {
  strategy?: CompilerStrategyId;
};

export type CompiledPromptPart = {
  text: string;
  selected: string[];
  stats: InstructionSelectionStats;
};

type CompilerContext = {
  dna: SongDNA;
  arrangement: ArrangementDNA;
};

const BUCKET_WEIGHT: Record<InstructionBucket, number> = {
  genre: 100,
  tempo: 95,
  vocal: 90,
  instrumentation: 85,
  production: 80,
  harmony: 70,
  arrangement: 65,
  role: 64,
  energy: 62,
  transition: 55,
  texture: 50,
  detail: 45,
  exclusions: 35
};

function matchReferenceSource(dna: SongDNA, text: string): InstructionSource | undefined {
  const traits = [
    ...(dna.reference?.sharedTraits ?? []),
    ...(dna.reference?.complementaryTraits ?? []),
    ...(dna.reference?.conflictingTraits ?? [])
  ];
  const textTokens = tokensOf(text);
  let best: InstructionSource | undefined;
  let bestScore = 0;
  for (const trait of traits) {
    const overlap = jaccardish(textTokens, tokensOf(trait.value));
    if (overlap < 0.35) continue;
    const source: InstructionSource =
      trait.confidence === "strong"
        ? "reference_strong"
        : trait.confidence === "likely"
          ? "reference_likely"
          : "reference_optional";
    if (overlap > bestScore) {
      bestScore = overlap;
      best = source;
    }
  }
  return best;
}

function jaccardish(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  let inter = 0;
  for (const token of left) {
    if (right.has(token)) inter += 1;
  }
  const union = left.size + right.size - inter;
  return union === 0 ? 0 : inter / union;
}

function sourceFor(
  dna: SongDNA,
  text: string,
  kind: "genre" | "tempo" | "vocal" | "instrument" | "production" | "texture" | "harmony" | "arrangement" | "exclusions"
): InstructionSource {
  const overrides = dna.meta.userOverrides;
  if (kind === "genre") return "explicit_user";
  if (kind === "vocal" && dna.composition.vocalStyle.trim()) return "explicit_user";
  if (kind === "tempo" && (overrides.includes("bpm") || overrides.includes("groove"))) return "sonic_control";
  if (kind === "instrument" && overrides.includes("instrumentFocus")) return "sonic_control";
  if (kind === "production" && (overrides.includes("productionEra") || overrides.includes("productionTexture"))) {
    return "sonic_control";
  }
  if (kind === "harmony") return "harmony";
  if (kind === "arrangement") return "arrangement";
  if (kind === "exclusions") return "inferred";
  return matchReferenceSource(dna, text) ?? "inferred";
}

function weighted(
  text: string | undefined,
  bucket: InstructionBucket,
  extras?: { extra?: number; source?: InstructionSource; scope?: "global" | "local" }
): WeightedInstruction | undefined {
  if (!text?.trim() || isLowValue(text)) return undefined;
  return {
    text: text.trim(),
    weight: BUCKET_WEIGHT[bucket] + (extras?.extra ?? 0),
    bucket,
    source: extras?.source ?? "inferred",
    scope: extras?.scope ?? "global"
  };
}

function formatBpm(sonic: SonicDNA): string | undefined {
  if (typeof sonic.bpm === "number") return `~${sonic.bpm} BPM`;
  if (sonic.bpmRange) return `~${Math.round((sonic.bpmRange.min + sonic.bpmRange.max) / 2)} BPM`;
  return undefined;
}

function compileHarmonyDirection(harmony: HarmonyDNA | undefined, family: SongDNAGenreFamily): string | undefined {
  if (!harmony) return undefined;
  const mode = (harmony.modeTendency ?? harmony.scaleOrMode ?? "").replace(/\s+\(user-specified\)/i, "").trim();
  const motion = (harmony.tensionRelease ?? "").trim();
  const character = (harmony.harmonicCharacter ?? "").split(";")[0]?.trim();

  const modeShort = mode
    .replace(/tonal tendencies/i, "")
    .replace(/clear major or minor center with functional travel/i, "functional major/minor")
    .replace(/minor or modal loop color/i, "minor-modal loop")
    .replace(/minor and modal, often darker than functional pop/i, "minor-modal")
    .replace(/natural major\/minor with room for modal folk color/i, "natural major/minor")
    .replace(/minor or lush major with soul color/i, "lush minor/soul color")
    .replace(/follow the emotional color of the song/i, "")
    .trim();

  const motionText = motion.replace(/^with\s+/i, "").trim();

  if (family === "nu-metal") {
    return [modeShort || "minor-modal", "riff language", motionText ? `with ${motionText}` : "with crush-and-release tension"]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ");
  }
  if (family === "edm") {
    return [`${modeShort || "modal"} voicings`, motionText || "tension into the drop"].filter(Boolean).join(", ");
  }
  if (family === "hip-hop") {
    return [modeShort || "loop-based harmony", "leaving space for vocal rhythm"].join(", ");
  }
  if (family === "rnb") {
    return [modeShort || "lush color", "richer extensions and smooth voice leading"].join(" with ");
  }
  if (family === "acoustic" || family === "ballad") {
    return [modeShort || "natural harmony", "restrained movement"].join(" with ");
  }
  if (family === "reggaeton") {
    return [modeShort || "modal loop", "leaving rhythmic space for dembow"].join(", ");
  }
  if (family === "pop") {
    return [modeShort || "clear tonal center", motion || "chorus as the simplest payoff"].join(", ");
  }
  return [modeShort || character, motion].filter(Boolean).join(", ") || undefined;
}

function compileExclusions(dna: SongDNA, maxItems: number): string | undefined {
  const items = listSonicExclusionItems(dna.sonicExclusions).filter((item) => !isLowValue(item));
  if (items.length === 0) return undefined;
  const intended = [
    dna.sonic.primaryGenre,
    ...(dna.sonic.subgenres ?? []),
    dna.sonic.groove,
    dna.sonic.productionAesthetic,
    ...(dna.sonic.coreInstrumentation ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const useful = items.filter((item) => {
    const tokens = tokensOf(item);
    const overlap = tokens.filter((token) => intended.includes(token));
    return overlap.length < 2;
  });

  const picked = dedupeInstructions(useful).slice(0, Math.max(0, maxItems));
  if (picked.length === 0) return undefined;
  return `avoid ${picked.join("; ")}`;
}

function vocalIdentity(sonic: SonicDNA, compositionVocal: string): string | undefined {
  const parts = [sonic.vocalDelivery || compositionVocal, sonic.vocalRegister, sonic.vocalTexture]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  const unique = dedupeInstructions(parts);
  return unique[0];
}

function arrangementBehavior(arrangement: ArrangementDNA, family: SongDNAGenreFamily): string | undefined {
  const verses = arrangement.sections.filter((section) => section.sectionType === "verse");
  const payoffs = arrangement.sections.filter((section) =>
    ["chorus", "final-chorus", "drop", "hook"].includes(section.sectionType)
  );
  const verseEnergy = verses[0]?.energy;
  const payoffEnergy = payoffs[0]?.energy;
  const verseVocal = verses[0]?.vocalDirection;
  const payoffVocal = payoffs[0]?.vocalDirection ?? payoffs[0]?.vocalLayering;

  if (verseEnergy !== undefined && payoffEnergy !== undefined && payoffEnergy - verseEnergy >= 3) {
    if (family === "edm") return "restrained verses expanding into wide drop/chorus payoff";
    if (family === "acoustic") return "intimate dry verses opening into a fuller acoustic chorus";
    if (family === "hip-hop") return "dry pocket verses expanding into a wider stacked hook";
    if (family === "nu-metal") return "tight dry verses expanding into wide layered choruses";
    if (family === "rnb") return "intimate dry verses blooming into stacked warmer choruses";
    return "intimate dry verses expanding into wider layered choruses";
  }

  return [verseVocal, payoffVocal].filter(Boolean).join(" into ") || arrangement.globalArc;
}

function collectGlobalCandidates(ctx: CompilerContext, exclusionLimit: number): WeightedInstruction[] {
  const { dna, arrangement } = ctx;
  const sonic = dna.sonic;
  const genreLine = [sonic.primaryGenre, ...(sonic.subgenres ?? []).slice(0, 2)].filter(Boolean).join(" / ");
  const tempo = [formatBpm(sonic), sonic.tempoFeel, sonic.groove].filter(Boolean).join(", ");
  const instruments = (sonic.coreInstrumentation ?? []).join(", ");
  const harmony = compileHarmonyDirection(dna.harmony, dna.meta.genreFamily);
  const exclusions = compileExclusions(dna, exclusionLimit);

  return [
    weighted(genreLine, "genre", { source: sourceFor(dna, genreLine, "genre"), scope: "global" }),
    weighted(tempo, "tempo", { source: sourceFor(dna, tempo, "tempo"), scope: "global" }),
    weighted(vocalIdentity(sonic, dna.composition.vocalStyle), "vocal", {
      source: sourceFor(dna, vocalIdentity(sonic, dna.composition.vocalStyle) ?? "", "vocal"),
      scope: "global"
    }),
    weighted(instruments, "instrumentation", { source: sourceFor(dna, instruments, "instrument"), scope: "global" }),
    weighted(sonic.productionAesthetic, "production", {
      source: sourceFor(dna, sonic.productionAesthetic ?? "", "production"),
      scope: "global"
    }),
    weighted(harmony, "harmony", { source: "harmony", scope: "global" }),
    weighted(arrangementBehavior(arrangement, dna.meta.genreFamily), "arrangement", {
      source: "arrangement",
      scope: "global"
    }),
    weighted(sonic.distortionSaturation && sonic.distortionSaturation !== "minimal" ? sonic.distortionSaturation : undefined, "texture", {
      source: sourceFor(dna, sonic.distortionSaturation ?? "", "texture"),
      scope: "global"
    }),
    weighted(sonic.ambience && !/minimal/.test(sonic.ambience) ? sonic.ambience : undefined, "texture", {
      extra: -5,
      source: sourceFor(dna, sonic.ambience ?? "", "texture"),
      scope: "global"
    }),
    weighted(exclusions, "exclusions", { source: "inferred", scope: "global" })
  ].filter((item): item is WeightedInstruction => Boolean(item));
}

function collectSectionCandidates(section: SectionProductionDirection, sonic: SonicDNA): WeightedInstruction[] {
  const energyLabel =
    section.energy === undefined
      ? undefined
      : section.energy <= 4
        ? "controlled energy"
        : section.energy <= 7
          ? "rising energy"
          : "high arrangement intensity";
  const globalCore = (sonic.coreInstrumentation ?? []).join(", ").toLowerCase();
  const sectionInst = section.instrumentation?.join(", ");
  const instrumentationChange =
    sectionInst && sectionInst.toLowerCase() !== globalCore ? sectionInst : undefined;

  return [
    weighted(section.productionDirection, "role", { source: "arrangement", scope: "local" }),
    weighted(energyLabel, "energy", { source: "arrangement", scope: "local" }),
    weighted(instrumentationChange, "instrumentation", { source: "arrangement", scope: "local" }),
    weighted(section.drumDirection, "instrumentation", { extra: -4, source: "arrangement", scope: "local" }),
    weighted(section.vocalDirection, "vocal", { source: "arrangement", scope: "local" }),
    weighted(section.vocalLayering, "vocal", { extra: -6, source: "arrangement", scope: "local" }),
    weighted(section.transitionIntoNext, "transition", { source: "arrangement", scope: "local" }),
    weighted(section.spatialDirection, "detail", { source: "arrangement", scope: "local" }),
    weighted(section.density, "detail", { extra: -4, source: "arrangement", scope: "local" })
  ].filter((item): item is WeightedInstruction => Boolean(item));
}

function ensureArrangement(dna: SongDNA): ArrangementDNA {
  return (
    dna.arrangement ??
    inferArrangementDNA({
      composition: dna.composition,
      sonic: dna.sonic,
      harmony: dna.harmony,
      family: dna.meta.genreFamily
    })
  );
}

function contextOf(dna: SongDNA): CompilerContext {
  return { dna, arrangement: ensureArrangement(dna) };
}

function joinProducerBrief(parts: string[]): string {
  const cleaned = parts
    .map((part) => part.replace(/\.$/, "").trim())
    .filter(Boolean);
  if (cleaned.length === 0) return "";
  const sentence = cleaned.join(", ");
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function usesDeltaBlueprint(strategy: CompilerStrategyId): boolean {
  return strategy !== "legacy";
}

export function compileStylePromptDetailed(songDNA: SongDNA, options?: CompilePromptOptions): CompiledPromptPart {
  const strategy = options?.strategy ?? "default";
  const budgets = PROMPT_BUDGETS[strategy];
  const ctx = contextOf(songDNA);
  const candidates = collectGlobalCandidates(ctx, budgets.exclusionsCount);
  const stats = selectBudgetedInstructions(candidates, {
    maxInstructions: budgets.stylePromptInstructions,
    maxChars: budgets.stylePromptChars,
    family: songDNA.meta.genreFamily,
    sonic: songDNA.sonic
  });
  return {
    text: joinProducerBrief(stats.selected),
    selected: stats.selected,
    stats
  };
}

export function compileSunoStylePrompt(songDNA: SongDNA, options?: CompilePromptOptions): string {
  return compileStylePromptDetailed(songDNA, options).text;
}

function stripUniversalSectionInstructions(
  sections: Array<{ label: string; instructions: string[] }>
): { sections: Array<{ label: string; instructions: string[] }>; droppedForRedundancy: number } {
  if (sections.length < 2) return { sections, droppedForRedundancy: 0 };
  const counts = new Map<string, number>();
  for (const section of sections) {
    const seen = new Set<string>();
    for (const instruction of section.instructions) {
      const key = tokensOf(instruction).sort().join(" ");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const universal = new Set(
    [...counts.entries()].filter(([, count]) => count === sections.length).map(([key]) => key)
  );
  if (universal.size === 0) return { sections, droppedForRedundancy: 0 };

  let droppedForRedundancy = 0;
  const next = sections.map((section) => {
    const instructions = section.instructions.filter((instruction) => {
      const key = tokensOf(instruction).sort().join(" ");
      if (universal.has(key)) {
        droppedForRedundancy += 1;
        return false;
      }
      return true;
    });
    return { ...section, instructions };
  });
  return { sections: next, droppedForRedundancy };
}

export function compileBlueprintDetailed(songDNA: SongDNA, options?: CompilePromptOptions): CompiledPromptPart {
  const strategy = options?.strategy ?? "default";
  const budgets = PROMPT_BUDGETS[strategy];
  const arrangement = ensureArrangement(songDNA);
  const style = compileStylePromptDetailed(songDNA, options);
  const globalTexts = style.selected;
  const sectionStats: InstructionSelectionStats[] = [];

  let sections = arrangement.sections.map((section) => {
    const candidates = collectSectionCandidates(section, songDNA.sonic);
    const scoped = usesDeltaBlueprint(strategy) ? filterLocalDeltas(candidates, globalTexts) : { kept: candidates, droppedForRedundancy: 0 };
    const stats = selectBudgetedInstructions(scoped.kept, {
      maxInstructions: budgets.perSectionBlueprintInstructions,
      maxChars: budgets.perSectionBlueprintChars,
      family: songDNA.meta.genreFamily,
      sonic: songDNA.sonic
    });
    sectionStats.push({
      ...stats,
      droppedForRedundancy: stats.droppedForRedundancy + scoped.droppedForRedundancy,
      candidateInstructionCount: stats.candidateInstructionCount + scoped.droppedForRedundancy
    });
    return {
      label: section.label,
      instructions: stats.selected.length > 0 ? stats.selected : [section.productionDirection || "follow the song's density"]
    };
  });

  let extraRedundancy = 0;
  let extraBudget = 0;
  if (usesDeltaBlueprint(strategy)) {
    const stripped = stripUniversalSectionInstructions(sections);
    sections = stripped.sections;
    extraRedundancy += stripped.droppedForRedundancy;
    const budgeted = applyTotalBlueprintBudget(sections, budgets.totalBlueprintChars);
    sections = budgeted.sections;
    extraBudget += budgeted.droppedForBudget;
  }

  const blocks = sections.map((section) => {
    const line = section.instructions.join(", ") || "follow the song's density";
    return [`[${section.label}]`, line].join("\n");
  });
  const merged = mergeSelectionStats(sectionStats);
  return {
    text: blocks.join("\n\n").trim(),
    selected: sections.flatMap((section) => section.instructions),
    stats: {
      ...merged,
      droppedForRedundancy: merged.droppedForRedundancy + extraRedundancy,
      droppedForBudget: merged.droppedForBudget + extraBudget
    }
  };
}

export function compileSunoBlueprint(songDNA: SongDNA, options?: CompilePromptOptions): string {
  return compileBlueprintDetailed(songDNA, options).text;
}

export function compileSunoExportPrompt(
  songDNA: SongDNA,
  args: {
    lyrics: string;
    concept?: Pick<SongArchitectConcept, "theme" | "hookIdentity" | "structure">;
    runtimeLabel?: string;
    strategy?: CompilerStrategyId;
  }
): string {
  const options = { strategy: args.strategy ?? "default" };
  const style = compileSunoStylePrompt(songDNA, options);
  const blueprint = compileSunoBlueprint(songDNA, options);
  const head = [
    args.runtimeLabel ? `Target runtime: ${args.runtimeLabel}` : undefined,
    args.concept?.structure ? `Structure: ${args.concept.structure}` : `Structure: ${songDNA.composition.structure}`,
    args.concept?.hookIdentity ? `Hook identity: ${args.concept.hookIdentity}` : `Hook identity: ${songDNA.composition.hookIdentity}`
  ].filter(Boolean);

  return [
    ...head,
    "",
    "STYLE",
    style,
    "",
    "BLUEPRINT",
    blueprint,
    "",
    "LYRICS",
    args.lyrics.trim()
  ].join("\n");
}

export function compileSunoOutputs(
  songDNA: SongDNA,
  args: {
    lyrics: string;
    concept?: Pick<SongArchitectConcept, "theme" | "hookIdentity" | "structure">;
    runtimeLabel?: string;
    strategy?: CompilerStrategyId;
  }
): {
  stylePrompt: string;
  sunoBlueprint: string;
  exportPrompt: string;
} {
  const options = { strategy: args.strategy ?? "default" };
  return {
    stylePrompt: compileSunoStylePrompt(songDNA, options),
    sunoBlueprint: compileSunoBlueprint(songDNA, options),
    exportPrompt: compileSunoExportPrompt(songDNA, args)
  };
}

export function containsReferenceSourceNames(text: string, songDNA: SongDNA): boolean {
  const labels = songDNA.reference?.sources.map((source) => source.label.trim()).filter(Boolean) ?? [];
  if (labels.length === 0) return false;
  const haystack = text.toLowerCase();
  return labels.some((label) => haystack.includes(label.toLowerCase()));
}
