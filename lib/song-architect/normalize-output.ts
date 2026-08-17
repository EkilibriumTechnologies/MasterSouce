import { z } from "zod";
import { hasExplicitNumericEnergyCurve, inferArrangementDNA } from "@/lib/song-architect/arrangement-dna";
import { assembleLyricsFromSections as assembleCandidateLyrics } from "@/lib/song-architect/lyrics-text";
import { alignSongDNAWithConcept, buildSongDNA } from "@/lib/song-architect/song-dna";
import { getSongLengthBlueprint } from "@/lib/song-architect/song-length";
import { compileGenerationPackage } from "@/lib/song-architect/generation-compiler";
import { compileSunoStylePrompt } from "@/lib/song-architect/suno-compiler";
import type {
  GenerationTarget,
  SongArchitectCandidate,
  SongArchitectCandidateId,
  SongArchitectConcept,
  SongArchitectDiagnostics,
  SongArchitectOutput,
  SongArchitectResolvedInput,
  SongArchitectSelectionPresentation,
  SongDNA
} from "@/lib/song-architect/types";

const SongArchitectModelOutputSchema = z.object({
  concept: z.object({
    theme: z.string().min(1).max(220),
    angle: z.string().min(1).max(220),
    emotion: z.string().min(1).max(140),
    hookIdentity: z.string().min(1).max(220),
    tensionWords: z.array(z.string().min(1).max(40)).min(2).max(10),
    structure: z.string().min(1).max(260),
    energyCurve: z.string().min(1).max(220)
  }),
  lyricsSections: z
    .array(
      z.object({
        section: z.string().min(1).max(80),
        lines: z.array(z.string().min(1).max(240)).max(36)
      })
    )
    .min(1)
    .max(24),
  performanceNotes: z.array(z.string().min(1).max(220)).max(10).default([]),
  altHooks: z.array(z.string().min(1).max(180)).max(6).default([]),
  exportPrompt: z.string().min(1).max(14000).optional()
});

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function computeOverallScore(diagnostics: Omit<SongArchitectDiagnostics, "overallScore">): number {
  const values = Object.values(diagnostics);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return clampScore(avg);
}

function stripCodeFence(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  return text;
}

function repairJsonString(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/,\s*([}\]])/g, "$1");
}

type ParseStrategy = "direct" | "fence_strip" | "object_extract" | "failed";

function extractFirstTopLevelObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function safeParseJsonObject(text: string): { value: Record<string, unknown> | null; strategy: ParseStrategy } {
  const trimmed = text.trim();
  const directCandidate = repairJsonString(trimmed);
  try {
    const parsed = JSON.parse(directCandidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { value: parsed as Record<string, unknown>, strategy: "direct" };
    }
  } catch {
    // Continue with defensive parse strategies.
  }

  const fenceStripped = stripCodeFence(trimmed);
  if (fenceStripped !== trimmed) {
    try {
      const parsed = JSON.parse(repairJsonString(fenceStripped));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { value: parsed as Record<string, unknown>, strategy: "fence_strip" };
      }
    } catch {
      // Continue with extraction strategy.
    }
  }

  const extracted = extractFirstTopLevelObject(fenceStripped);
  if (extracted) {
    try {
      const parsed = JSON.parse(repairJsonString(extracted));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { value: parsed as Record<string, unknown>, strategy: "object_extract" };
      }
    } catch {
      // Unrecoverable parse.
    }
  }

  return { value: null, strategy: "failed" };
}

function buildDefaultDiagnostics(): SongArchitectDiagnostics {
  const diagnosticsBase = {
    chorusPunch: 70,
    lineClarity: 75,
    rhythmConsistency: 72,
    energyProgression: 74,
    hookIdentity: 73,
    endingImpact: 70,
    uniqueness: 71
  };
  return {
    ...diagnosticsBase,
    overallScore: computeOverallScore(diagnosticsBase)
  };
}

function fallbackSongDNAFromConcept(concept: SongArchitectConcept): SongDNA {
  const composition = {
    theme: concept.theme,
    angle: concept.angle,
    emotionalIntent: concept.emotion,
    hookIdentity: concept.hookIdentity,
    lyricalPerspective: concept.angle,
    language: "English",
    structure: concept.structure,
    runtime: "~3 minutes",
    lineDensity: "balanced" as const,
    vocalStyle: "",
    mustInclude: [],
    avoidWords: [],
    energyCurve: concept.energyCurve
  };
  const sonic = {
    emotionalSonicExpression: concept.emotion
  };
  return {
    composition,
    sonic,
    arrangement: inferArrangementDNA({
      composition,
      sonic,
      family: "generic"
    }),
    meta: {
      genreFamily: "generic",
      inferenceMode: "automatic",
      userOverrides: []
    }
  };
}

function resolveCanonicalSongDNA(args: {
  resolvedInput?: SongArchitectResolvedInput;
  songDNA?: SongDNA;
  concept: SongArchitectConcept;
}): SongDNA {
  if (args.resolvedInput) {
    return alignSongDNAWithConcept(args.resolvedInput, args.concept);
  }
  if (args.songDNA) {
    const energyCurve = hasExplicitNumericEnergyCurve(args.songDNA.composition.energyCurve)
      ? args.songDNA.composition.energyCurve
      : args.concept.energyCurve;
    const composition = {
      ...args.songDNA.composition,
      theme: args.concept.theme,
      angle: args.concept.angle,
      emotionalIntent: args.concept.emotion,
      hookIdentity: args.concept.hookIdentity,
      structure: args.concept.structure,
      energyCurve
    };
    return {
      ...args.songDNA,
      composition,
      arrangement: inferArrangementDNA({
        composition,
        sonic: args.songDNA.sonic,
        harmony: args.songDNA.harmony,
        family: args.songDNA.meta.genreFamily
      })
    };
  }
  return fallbackSongDNAFromConcept(args.concept);
}

function buildStyleBlock(input?: SongArchitectResolvedInput, songDNA?: SongDNA): string {
  if (songDNA) return compileSunoStylePrompt(songDNA);
  if (!input) return "modern vocal, concise lines, dynamic lift";
  const runtimeLabel = getSongLengthBlueprint(input.songLength).runtimeLabel;
  return [
    input.genre,
    `${input.emotion} mood`,
    input.vocalStyle,
    `${input.lineDensity} lines`,
    `${runtimeLabel} song form`,
    input.energyCurve
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeLyricsSections(
  value: unknown,
  fallbackStyleBlock: string
): Array<{ section: string; lines: string[] }> {
  const source = Array.isArray(value) ? value : [];
  const sections = source
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const section = typeof (entry as { section?: unknown }).section === "string" ? (entry as { section: string }).section.trim() : "";
      const linesSource = (entry as { lines?: unknown }).lines;
      const lines = Array.isArray(linesSource)
        ? linesSource
            .filter((line): line is string => typeof line === "string")
            .map((line) => line.trim())
            .filter(Boolean)
        : [];
      if (!section) return null;
      if (section.toLowerCase() !== "style block" && lines.length === 0) return null;
      return { section, lines };
    })
    .filter((entry): entry is { section: string; lines: string[] } => entry !== null);

  const hasStyleBlock = sections.some((entry) => entry.section.toLowerCase() === "style block");
  if (!hasStyleBlock) {
    sections.unshift({ section: "STYLE BLOCK", lines: [fallbackStyleBlock] });
  }
  return sections;
}

function extractStylePromptFromSections(
  sections: Array<{ section: string; lines: string[] }>,
  fallbackStyleBlock: string
): {
  stylePrompt: string;
  lyricSections: Array<{ section: string; lines: string[] }>;
} {
  const styleSection = sections.find((section, index) => {
    const name = section.section.toLowerCase().trim();
    return index === 0 || name === "style block" || name.includes("style");
  });
  const stylePrompt = styleSection?.lines[0]?.trim() || fallbackStyleBlock;
  const lyricSections = sections.filter((section) => section !== styleSection);
  return { stylePrompt, lyricSections };
}

function assembleLyricsFromSections(sections: Array<{ section: string; lines: string[] }>): string {
  const blocks: string[] = [];
  for (const section of sections) {
    blocks.push(`[${section.section}]`);
    blocks.push(...section.lines);
  }
  return blocks.join("\n").trim();
}

function toRecoveryOutput(
  parsedJson: Record<string, unknown>,
  fallbackStyleBlock: string,
  resolvedInput?: SongArchitectResolvedInput,
  incomingSongDNA?: SongDNA,
  extras?: {
    generationOptimizedLyrics?: string;
    selection?: SongArchitectSelectionPresentation;
    generationTarget?: GenerationTarget;
  }
): Omit<SongArchitectOutput, "meta"> | null {
  const source = parsedJson;
  const conceptSource = (source.concept ?? {}) as Record<string, unknown>;
  const diagnosticsSource = (source.diagnostics ?? {}) as Record<string, unknown>;

  const performanceNotes = Array.isArray(source.performanceNotes)
    ? source.performanceNotes.filter((note): note is string => typeof note === "string" && note.trim().length > 0).slice(0, 10)
    : [];
  const altHooks = Array.isArray(source.altHooks)
    ? source.altHooks.filter((hook): hook is string => typeof hook === "string" && hook.trim().length > 0).slice(0, 6)
    : [];
  const lyricsSections = normalizeLyricsSections(source.lyricsSections, fallbackStyleBlock);
  const { stylePrompt, lyricSections } = extractStylePromptFromSections(lyricsSections, fallbackStyleBlock);
  const lyrics = assembleLyricsFromSections(lyricSections);
  if (!lyrics) return null;

  const diagnosticsBase = {
    chorusPunch: clampScore(typeof diagnosticsSource.chorusPunch === "number" ? diagnosticsSource.chorusPunch : 70),
    lineClarity: clampScore(typeof diagnosticsSource.lineClarity === "number" ? diagnosticsSource.lineClarity : 75),
    rhythmConsistency: clampScore(
      typeof diagnosticsSource.rhythmConsistency === "number" ? diagnosticsSource.rhythmConsistency : 72
    ),
    energyProgression: clampScore(
      typeof diagnosticsSource.energyProgression === "number" ? diagnosticsSource.energyProgression : 74
    ),
    hookIdentity: clampScore(typeof diagnosticsSource.hookIdentity === "number" ? diagnosticsSource.hookIdentity : 73),
    endingImpact: clampScore(typeof diagnosticsSource.endingImpact === "number" ? diagnosticsSource.endingImpact : 70),
    uniqueness: clampScore(typeof diagnosticsSource.uniqueness === "number" ? diagnosticsSource.uniqueness : 71)
  };

  const diagnostics: SongArchitectDiagnostics = {
    ...diagnosticsBase,
    overallScore:
      typeof diagnosticsSource.overallScore === "number"
        ? clampScore(diagnosticsSource.overallScore)
        : computeOverallScore(diagnosticsBase)
  };

  const concept = {
    theme: typeof conceptSource.theme === "string" && conceptSource.theme.trim() ? conceptSource.theme : "Custom artist story",
    angle: typeof conceptSource.angle === "string" && conceptSource.angle.trim() ? conceptSource.angle : "Escalating personal tension",
    emotion: typeof conceptSource.emotion === "string" && conceptSource.emotion.trim() ? conceptSource.emotion : "Driven",
    hookIdentity:
      typeof conceptSource.hookIdentity === "string" && conceptSource.hookIdentity.trim()
        ? conceptSource.hookIdentity
        : "Memorable repeatable anchor phrase",
    tensionWords: Array.isArray(conceptSource.tensionWords)
      ? conceptSource.tensionWords
          .filter((word): word is string => typeof word === "string" && word.trim().length > 0)
          .slice(0, 10)
      : ["pressure", "release"],
    structure:
      typeof conceptSource.structure === "string" && conceptSource.structure.trim()
        ? conceptSource.structure
        : "Verse 1 > Pre-Chorus > Chorus > Verse 2 > Bridge > Final Chorus",
    energyCurve:
      typeof conceptSource.energyCurve === "string" && conceptSource.energyCurve.trim()
        ? conceptSource.energyCurve
        : "steady rise with high-impact final chorus"
  };

  const songDNA = resolveCanonicalSongDNA({
    resolvedInput,
    songDNA: incomingSongDNA,
    concept
  });
  const compiled = compileGenerationPackage(songDNA, extras?.generationTarget ?? { provider: "suno" }, {
    lyrics: extras?.generationOptimizedLyrics ?? lyrics,
    cleanLyrics: lyrics,
    concept,
    ...(resolvedInput?.songLength
      ? { runtimeLabel: getSongLengthBlueprint(resolvedInput.songLength).runtimeLabel }
      : {})
  });

  return {
    concept,
    songDNA,
    stylePrompt: compiled.stylePrompt || stylePrompt,
    sunoBlueprint: compiled.blueprint,
    lyrics,
    generationOptimizedLyrics: extras?.generationOptimizedLyrics ?? lyrics,
    performanceNotes,
    altHooks,
    // Model-created exportPrompt is legacy only. Canonical Song DNA compiler wins.
    exportPrompt: compiled.exportPrompt,
    diagnostics,
    ...(extras?.selection ? { selection: extras.selection } : {}),
    ...(compiled.diagnostics ? { compilerDiagnostics: compiled.diagnostics } : {})
  };
}

export function parseSongArchitectCandidateFromRaw(
  rawOutputText: string,
  id: SongArchitectCandidateId
): SongArchitectCandidate {
  const parsed = safeParseJsonObject(rawOutputText);
  if (!parsed.value) {
    throw new Error("Could not parse JSON object from model output.");
  }
  const validated = SongArchitectModelOutputSchema.safeParse(parsed.value);
  const source = validated.success ? validated.data : parsed.value;
  const conceptSource = (source.concept ?? {}) as Record<string, unknown>;
  const lyricsSections = normalizeLyricsSections((source as { lyricsSections?: unknown }).lyricsSections, "modern vocal");
  const { lyricSections } = extractStylePromptFromSections(lyricsSections, "modern vocal");
  const lyrics = assembleCandidateLyrics(lyricSections);
  if (!lyrics) {
    throw new Error("Song Architect candidate lyrics could not be assembled.");
  }
  const concept = validated.success
    ? validated.data.concept
    : {
        theme: typeof conceptSource.theme === "string" ? conceptSource.theme : "Custom artist story",
        angle: typeof conceptSource.angle === "string" ? conceptSource.angle : "Escalating personal tension",
        emotion: typeof conceptSource.emotion === "string" ? conceptSource.emotion : "Driven",
        hookIdentity:
          typeof conceptSource.hookIdentity === "string" ? conceptSource.hookIdentity : "Memorable repeatable anchor phrase",
        tensionWords: Array.isArray(conceptSource.tensionWords)
          ? conceptSource.tensionWords.filter((word): word is string => typeof word === "string").slice(0, 10)
          : ["pressure", "release"],
        structure:
          typeof conceptSource.structure === "string"
            ? conceptSource.structure
            : "Verse 1 > Pre-Chorus > Chorus > Verse 2 > Bridge > Final Chorus",
        energyCurve:
          typeof conceptSource.energyCurve === "string" ? conceptSource.energyCurve : "steady rise with high-impact final chorus"
      };
  const performanceNotes = Array.isArray((source as { performanceNotes?: unknown }).performanceNotes)
    ? ((source as { performanceNotes: unknown[] }).performanceNotes.filter(
        (note): note is string => typeof note === "string"
      ) as string[])
    : [];
  const altHooks = Array.isArray((source as { altHooks?: unknown }).altHooks)
    ? ((source as { altHooks: unknown[] }).altHooks.filter((hook): hook is string => typeof hook === "string") as string[])
    : [];

  return {
    id,
    concept,
    lyricsSections: lyricSections,
    lyrics,
    performanceNotes,
    altHooks,
    rawOutputText
  };
}

export function normalizeSongArchitectOutput(args: {
  rawOutputText: string;
  model: string;
  generatedAt: string;
  presetUsed?: string;
  resolvedInput?: SongArchitectResolvedInput;
  songDNA?: SongDNA;
  generationOptimizedLyrics?: string;
  selection?: SongArchitectSelectionPresentation;
  generationTarget?: GenerationTarget;
  log?: (event: string, payload: Record<string, unknown>) => void;
}): SongArchitectOutput {
  const parsed = safeParseJsonObject(args.rawOutputText);
  args.log?.("normalize_parse_result", { strategy: parsed.strategy, ok: Boolean(parsed.value) });
  if (!parsed.value) {
    throw new Error("Could not parse JSON object from model output.");
  }
  const seedDNA = args.songDNA ?? (args.resolvedInput ? buildSongDNA(args.resolvedInput) : undefined);
  const fallbackStyleBlock = buildStyleBlock(args.resolvedInput, seedDNA);
  const validated = SongArchitectModelOutputSchema.safeParse(parsed.value);

  if (!validated.success) {
    const recovered = toRecoveryOutput(parsed.value, fallbackStyleBlock, args.resolvedInput, seedDNA, {
      generationOptimizedLyrics: args.generationOptimizedLyrics,
      selection: args.selection,
      generationTarget: args.generationTarget
    });
    if (!recovered) {
      throw new Error("Song Architect model output did not match expected schema.");
    }
    args.log?.("normalize_recovery_used", {
      parseStrategy: parsed.strategy,
      reason: "schema_mismatch_partial_recovery"
    });
    return {
      ...recovered,
      meta: {
        ...(args.presetUsed ? { presetUsed: args.presetUsed } : {}),
        model: args.model,
        generatedAt: args.generatedAt,
        ...(args.resolvedInput?.songLength ? { songLength: args.resolvedInput.songLength } : {})
      }
    };
  }

  const normalizedSections = normalizeLyricsSections(validated.data.lyricsSections, fallbackStyleBlock);
  const { stylePrompt, lyricSections } = extractStylePromptFromSections(normalizedSections, fallbackStyleBlock);
  const lyrics = assembleLyricsFromSections(lyricSections);
  if (!lyrics) {
    throw new Error("Song Architect lyricsSections could not be assembled into lyrics.");
  }
  const diagnostics = buildDefaultDiagnostics();
  const songDNA = resolveCanonicalSongDNA({
    resolvedInput: args.resolvedInput,
    songDNA: seedDNA,
    concept: validated.data.concept
  });
  const compiled = compileGenerationPackage(songDNA, args.generationTarget ?? { provider: "suno" }, {
    lyrics: args.generationOptimizedLyrics ?? lyrics,
    cleanLyrics: lyrics,
    concept: validated.data.concept,
    ...(args.resolvedInput?.songLength
      ? { runtimeLabel: getSongLengthBlueprint(args.resolvedInput.songLength).runtimeLabel }
      : {})
  });
  args.log?.("normalize_success", {
    parseStrategy: parsed.strategy,
    usedRecovery: false,
    exportPromptAuthority: "song_dna_compiler",
    ignoredLegacyModelExportPrompt: Boolean(validated.data.exportPrompt?.trim()),
    compilerStrategy: compiled.diagnostics?.strategy ?? "default",
    stylePromptLength: compiled.stylePrompt.length,
    blueprintLength: compiled.blueprint.length
  });

  return {
    concept: validated.data.concept,
    songDNA,
    stylePrompt: compiled.stylePrompt || stylePrompt,
    sunoBlueprint: compiled.blueprint,
    lyrics,
    generationOptimizedLyrics: args.generationOptimizedLyrics ?? lyrics,
    performanceNotes: validated.data.performanceNotes,
    altHooks: validated.data.altHooks,
    // Model-created exportPrompt is legacy only. Canonical Song DNA compiler wins.
    exportPrompt: compiled.exportPrompt,
    diagnostics,
    ...(args.selection ? { selection: args.selection } : {}),
    ...(compiled.diagnostics ? { compilerDiagnostics: compiled.diagnostics } : {}),
    meta: {
      ...(args.presetUsed ? { presetUsed: args.presetUsed } : {}),
      model: args.model,
      generatedAt: args.generatedAt,
      ...(args.resolvedInput?.songLength ? { songLength: args.resolvedInput.songLength } : {})
    }
  };
}
