import { PROMPT_BUDGETS, countWords, mergeSelectionStats } from "@/lib/song-architect/compiler-budget";
import { formatTargetLabel, resolveGenerationTarget, toGenerationTarget } from "@/lib/song-architect/generation-target";
import { applyPronunciationAdjustments, budgetPronunciationAdjustments } from "@/lib/song-architect/pronunciation";
import {
  compileBlueprintDetailed,
  compileStylePromptDetailed,
  compileSunoBlueprint,
  compileSunoExportPrompt,
  compileSunoStylePrompt
} from "@/lib/song-architect/suno-compiler";
import type {
  CompilerDiagnostics,
  CompilerStrategyId,
  GenerationPackage,
  GenerationTarget,
  PronunciationAdjustment,
  SongArchitectConcept,
  SongDNA
} from "@/lib/song-architect/types";

export type CompileGenerationArgs = {
  lyrics?: string;
  cleanLyrics?: string;
  pronunciationAdjustments?: PronunciationAdjustment[];
  concept?: Pick<SongArchitectConcept, "theme" | "hookIdentity" | "structure">;
  runtimeLabel?: string;
  /** Test seam: force the selected strategy to fail so fallback can be verified. */
  forceStrategyFailure?: boolean;
};

function emptyStats() {
  return {
    selected: [] as string[],
    candidateInstructionCount: 0,
    selectedInstructionCount: 0,
    droppedForRedundancy: 0,
    droppedForBudget: 0,
    conflictsResolved: 0,
    sourceBreakdown: {} as Record<string, number>
  };
}

function buildDiagnostics(args: {
  targetLabel: string;
  strategy: string;
  stylePrompt: string;
  blueprint: string;
  stats: ReturnType<typeof mergeSelectionStats>;
  fallbackUsed?: boolean;
  unknownTarget?: boolean;
}): CompilerDiagnostics {
  return {
    target: args.targetLabel,
    strategy: args.strategy,
    stylePromptLength: args.stylePrompt.length,
    stylePromptWordCount: countWords(args.stylePrompt),
    blueprintLength: args.blueprint.length,
    blueprintWordCount: countWords(args.blueprint),
    candidateInstructionCount: args.stats.candidateInstructionCount,
    selectedInstructionCount: args.stats.selectedInstructionCount,
    droppedForRedundancy: args.stats.droppedForRedundancy,
    droppedForBudget: args.stats.droppedForBudget,
    conflictsResolved: args.stats.conflictsResolved,
    sourceBreakdown: args.stats.sourceBreakdown,
    ...(args.fallbackUsed ? { fallbackUsed: true } : {}),
    ...(args.unknownTarget ? { unknownTarget: true } : {})
  };
}

function assembleExport(args: {
  provider: "suno" | "generic";
  songDNA: SongDNA;
  stylePrompt: string;
  blueprint: string;
  lyrics: string;
  concept?: Pick<SongArchitectConcept, "theme" | "hookIdentity" | "structure">;
  runtimeLabel?: string;
}): string {
  const styleLabel = args.provider === "generic" ? "STYLE BRIEF" : "STYLE";
  const blueprintLabel = args.provider === "generic" ? "PRODUCTION BLUEPRINT" : "BLUEPRINT";
  const head = [
    args.runtimeLabel ? `Target runtime: ${args.runtimeLabel}` : undefined,
    args.concept?.structure ? `Structure: ${args.concept.structure}` : `Structure: ${args.songDNA.composition.structure}`,
    args.concept?.hookIdentity
      ? `Hook identity: ${args.concept.hookIdentity}`
      : `Hook identity: ${args.songDNA.composition.hookIdentity}`
  ].filter(Boolean);

  return [
    ...head,
    "",
    styleLabel,
    args.stylePrompt,
    "",
    blueprintLabel,
    args.blueprint,
    "",
    "LYRICS",
    args.lyrics.trim()
  ].join("\n");
}

function resolveGenerationLyrics(args: CompileGenerationArgs, maxAnnotations: number): {
  cleanLyrics: string;
  generationLyrics: string;
} {
  const cleanLyrics = (args.cleanLyrics ?? args.lyrics ?? "").trim();
  const incoming = (args.lyrics ?? cleanLyrics).trim();
  if (!args.pronunciationAdjustments || args.pronunciationAdjustments.length === 0) {
    return { cleanLyrics: cleanLyrics || incoming, generationLyrics: incoming || cleanLyrics };
  }
  const budgeted = budgetPronunciationAdjustments(args.pronunciationAdjustments, maxAnnotations);
  return {
    cleanLyrics: cleanLyrics || incoming,
    generationLyrics: applyPronunciationAdjustments(cleanLyrics || incoming, budgeted)
  };
}

function compileResolved(
  songDNA: SongDNA,
  strategy: CompilerStrategyId,
  provider: "suno" | "generic",
  args: CompileGenerationArgs
): { stylePrompt: string; blueprint: string; stats: ReturnType<typeof mergeSelectionStats> } {
  const options = { strategy };
  const style = compileStylePromptDetailed(songDNA, options);
  const blueprint = compileBlueprintDetailed(songDNA, options);
  if (!style.text.trim() && !blueprint.text.trim()) {
    throw new Error("compiler produced empty prompts");
  }
  return {
    stylePrompt: style.text,
    blueprint: blueprint.text,
    stats: mergeSelectionStats([style.stats, blueprint.stats])
  };
}

function minimalSafeCompile(songDNA: SongDNA): { stylePrompt: string; blueprint: string } {
  const genre = songDNA.sonic.primaryGenre || songDNA.meta.genreFamily;
  const vocal = songDNA.sonic.vocalDelivery || songDNA.composition.vocalStyle;
  const stylePrompt = joinFallback([genre, songDNA.sonic.groove, vocal, songDNA.sonic.productionAesthetic]);
  const sections = songDNA.arrangement?.sections ?? [];
  const blueprint =
    sections.length > 0
      ? sections
          .map((section) => `[${section.label}]\n${section.productionDirection || section.density || "follow the song's density"}`)
          .join("\n\n")
      : "[Verse 1]\nfollow the song's density";
  return { stylePrompt, blueprint };
}

function joinFallback(parts: Array<string | undefined>): string {
  const cleaned = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  if (cleaned.length === 0) return "contemporary vocal, concise production.";
  const sentence = cleaned.join(", ");
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export function compileGenerationPackage(
  songDNA: SongDNA,
  targetInput?: GenerationTarget | { provider?: string; version?: string; strategy?: string },
  args: CompileGenerationArgs = {}
): GenerationPackage {
  const resolved = resolveGenerationTarget(targetInput);
  const target = toGenerationTarget(resolved);
  const lyricsPair = resolveGenerationLyrics(args, PROMPT_BUDGETS[resolved.strategy].pronunciationAnnotations);

  const compileOnce = (strategy: CompilerStrategyId, provider: "suno" | "generic") => {
    if (args.forceStrategyFailure) {
      throw new Error("forced compiler strategy failure");
    }
    return compileResolved(songDNA, strategy, provider, args);
  };

  let stylePrompt = "";
  let blueprint = "";
  let stats = emptyStats();
  let fallbackUsed = false;
  let usedStrategy = resolved.strategy;
  let usedProvider = resolved.provider;

  try {
    const compiled = compileOnce(resolved.strategy, resolved.provider);
    stylePrompt = compiled.stylePrompt;
    blueprint = compiled.blueprint;
    stats = compiled.stats;
  } catch {
    fallbackUsed = true;
    usedStrategy = "default";
    usedProvider = resolved.unknownTarget ? "generic" : "suno";
    try {
      const compiled = compileResolved(songDNA, "default", usedProvider, { ...args, forceStrategyFailure: false });
      stylePrompt = compiled.stylePrompt;
      blueprint = compiled.blueprint;
      stats = compiled.stats;
    } catch {
      const safe = minimalSafeCompile(songDNA);
      stylePrompt = safe.stylePrompt;
      blueprint = safe.blueprint;
      stats = emptyStats();
    }
  }

  const exportPrompt = assembleExport({
    provider: usedProvider,
    songDNA,
    stylePrompt,
    blueprint,
    lyrics: lyricsPair.generationLyrics,
    concept: args.concept,
    runtimeLabel: args.runtimeLabel
  });

  let diagnostics: CompilerDiagnostics | undefined;
  try {
    diagnostics = buildDiagnostics({
      targetLabel: formatTargetLabel({ ...resolved, provider: usedProvider, strategy: usedStrategy }),
      strategy: usedStrategy,
      stylePrompt,
      blueprint,
      stats,
      fallbackUsed,
      unknownTarget: resolved.unknownTarget
    });
  } catch {
    diagnostics = undefined;
  }

  return {
    target: usedProvider === "suno" ? { provider: "suno", strategy: usedStrategy, ...(resolved.version ? { version: resolved.version } : {}) } : { provider: "generic", strategy: usedStrategy, ...(resolved.version ? { version: resolved.version } : {}) },
    stylePrompt,
    blueprint,
    cleanLyrics: lyricsPair.cleanLyrics,
    generationLyrics: lyricsPair.generationLyrics,
    exportPrompt,
    ...(diagnostics ? { diagnostics } : {})
  };
}

export function compileSunoCompatibleOutputs(
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
  const pkg = compileGenerationPackage(songDNA, { provider: "suno", strategy: args.strategy ?? "default" }, args);
  return {
    stylePrompt: pkg.stylePrompt,
    sunoBlueprint: pkg.blueprint,
    exportPrompt: pkg.exportPrompt
  };
}

export {
  compileSunoBlueprint,
  compileSunoExportPrompt,
  compileSunoStylePrompt
};
