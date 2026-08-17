import { inferArrangementDNA } from "@/lib/song-architect/arrangement-dna";
import { translateEmotionalIntent } from "@/lib/song-architect/emotion-translation";
import { formatHarmonyDNAPlainText, inferHarmonyDNA } from "@/lib/song-architect/harmony-dna";
import {
  buildReferenceDNA,
  formatReferenceInfluenceForPrompt,
  promptSafeSongDNAReference,
  resolveSonicWithReferences,
  toReferenceSources
} from "@/lib/song-architect/reference-dna";
import { formatSonicExclusionsPlainText, inferSonicExclusions } from "@/lib/song-architect/sonic-exclusions";
import { inferSonicDNA } from "@/lib/song-architect/sonic-inference";
import { getSongLengthBlueprint } from "@/lib/song-architect/song-length";
import { compileSunoStylePrompt } from "@/lib/song-architect/suno-compiler";
import type {
  CompositionDNA,
  LyricConstraints,
  SongArchitectConcept,
  SongArchitectResolvedInput,
  SongArchitectSonicControls,
  SongDNA,
  SonicDNA
} from "@/lib/song-architect/types";

function inferLyricalPerspective(angle: string): string {
  const text = angle.toLowerCase();
  const first = /\b(i|me|my|mine|we|us|our|myself)\b/.test(text);
  const second = /\b(you|your|yours|yourself)\b/.test(text);
  const third = /\b(he|she|they|him|her|them|his|hers|their)\b/.test(text);
  if (first && second) return `first-to-second person: ${angle}`;
  if (first) return `first-person: ${angle}`;
  if (second) return `second-person: ${angle}`;
  if (third) return `third-person: ${angle}`;
  return angle;
}

export function buildCompositionDNA(input: SongArchitectResolvedInput): CompositionDNA {
  return {
    theme: input.theme,
    angle: input.angle,
    emotionalIntent: input.emotion,
    hookIdentity: input.hookIdentity,
    lyricalPerspective: inferLyricalPerspective(input.angle),
    language: input.language,
    structure: input.structure,
    runtime: getSongLengthBlueprint(input.songLength).runtimeLabel,
    lineDensity: input.lineDensity,
    vocalStyle: input.vocalStyle,
    mustInclude: [...input.mustInclude],
    avoidWords: [...input.avoidWords],
    energyCurve: input.energyCurve
  };
}

export function lyricConstraintsFromComposition(composition: CompositionDNA): LyricConstraints {
  return {
    avoidWords: [...composition.avoidWords],
    mustInclude: [...composition.mustInclude],
    lyricalPerspective: composition.lyricalPerspective,
    language: composition.language
  };
}

export function buildSongDNA(input: SongArchitectResolvedInput): SongDNA {
  const composition = buildCompositionDNA(input);
  const expression = translateEmotionalIntent(composition.emotionalIntent);
  const { sonic: baseSonic, family, userOverrides } = inferSonicDNA({
    genre: input.genre,
    vocalStyle: input.vocalStyle,
    energyCurve: input.energyCurve,
    lineDensity: input.lineDensity,
    userNotes: input.userNotes,
    expression,
    controls: input.sonicControls
  });

  const sources = toReferenceSources(input);
  const reference = buildReferenceDNA(sources, {
    genre: input.genre,
    emotion: composition.emotionalIntent,
    vocalStyle: composition.vocalStyle,
    energyCurve: composition.energyCurve,
    structure: composition.structure
  });
  const sonic = resolveSonicWithReferences({
    sonic: baseSonic,
    reference,
    userOverrides,
    intent: {
      genre: input.genre,
      emotion: composition.emotionalIntent,
      vocalStyle: composition.vocalStyle,
      energyCurve: composition.energyCurve,
      structure: composition.structure
    }
  });
  const harmony = inferHarmonyDNA({
    family,
    sonic,
    expression,
    userNotes: input.userNotes
  });
  const sonicExclusions = inferSonicExclusions({
    family,
    sonic,
    genre: input.genre,
    emotion: composition.emotionalIntent
  });
  const arrangement = inferArrangementDNA({
    composition,
    sonic,
    harmony,
    family
  });

  return {
    composition,
    sonic,
    ...(reference ? { reference } : {}),
    ...(Object.keys(harmony).length > 0 ? { harmony } : {}),
    ...(sonicExclusions ? { sonicExclusions } : {}),
    arrangement,
    meta: {
      genreFamily: family,
      inferenceMode: userOverrides.length > 0 ? "mixed" : "automatic",
      userOverrides
    }
  };
}

export function alignSongDNAWithConcept(
  input: SongArchitectResolvedInput,
  concept: SongArchitectConcept
): SongDNA {
  return buildSongDNA({
    ...input,
    theme: concept.theme,
    angle: concept.angle,
    emotion: concept.emotion,
    hookIdentity: concept.hookIdentity,
    structure: concept.structure,
    energyCurve: concept.energyCurve
  });
}

function formatList(values?: string[]): string | undefined {
  if (!values || values.length === 0) return undefined;
  return values.join(", ");
}

function formatBpm(sonic: SonicDNA): string | undefined {
  if (typeof sonic.bpm === "number") {
    if (sonic.bpmRange) return `${sonic.bpm} BPM (${sonic.bpmRange.min}–${sonic.bpmRange.max})`;
    return `${sonic.bpm} BPM`;
  }
  if (sonic.bpmRange) return `${sonic.bpmRange.min}–${sonic.bpmRange.max} BPM`;
  return undefined;
}

export function formatSongDNAStylePrompt(dna: SongDNA): string {
  return compileSunoStylePrompt(dna);
}

export function formatSongDNAForPrompt(dna: SongDNA): string {
  const c = dna.composition;
  const s = dna.sonic;
  const compositionLines = [
    `theme: ${c.theme}`,
    `angle: ${c.angle}`,
    `emotional intent: ${c.emotionalIntent}`,
    `hook identity: ${c.hookIdentity}`,
    `structure: ${c.structure}`,
    `runtime: ${c.runtime}`,
    `line density: ${c.lineDensity}`,
    `vocal style: ${c.vocalStyle}`,
    `energy curve: ${c.energyCurve}`,
  ].filter(Boolean);

  const sonicEntries: Array<[string, string | undefined]> = [
    ["primary genre", s.primaryGenre],
    ["subgenres", formatList(s.subgenres)],
    ["bpm", formatBpm(s)],
    ["tempo feel", s.tempoFeel],
    ["groove", s.groove],
    ["core instrumentation", formatList(s.coreInstrumentation)],
    ["supporting instrumentation", formatList(s.supportingInstrumentation)],
    ["drum character", s.drumCharacter],
    ["bass character", s.bassCharacter],
    ["harmonic character", s.harmonicCharacter],
    ["vocal delivery", s.vocalDelivery],
    ["vocal register", s.vocalRegister],
    ["vocal texture", s.vocalTexture],
    ["vocal layering", s.vocalLayering],
    ["production aesthetic", s.productionAesthetic],
    ["production era", s.productionEra],
    ["distortion/saturation", s.distortionSaturation],
    ["ambience", s.ambience],
    ["spatial character", s.spatialCharacter],
    ["dynamics", s.dynamics],
    ["emotional sonic expression", s.emotionalSonicExpression]
  ];

  const sonicLines = sonicEntries
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`);

  const lyric = lyricConstraintsFromComposition(c);
  const lyricLines = [
    `language: ${lyric.language}`,
    `lyrical perspective: ${lyric.lyricalPerspective}`,
    lyric.mustInclude.length > 0 ? `must include: ${lyric.mustInclude.join(", ")}` : undefined,
    lyric.avoidWords.length > 0 ? `avoid words: ${lyric.avoidWords.join(", ")}` : undefined
  ].filter(Boolean);

  const harmonyLines = dna.harmony
    ? formatHarmonyDNAPlainText(dna.harmony)
        .split("\n")
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const exclusionLines = dna.sonicExclusions
    ? formatSonicExclusionsPlainText(dna.sonicExclusions).split("\n").filter(Boolean)
    : [];
  const referenceLine = formatReferenceInfluenceForPrompt(dna.reference);
  const arrangementLines = dna.arrangement
    ? [
        dna.arrangement.globalArc ? `global arc: ${dna.arrangement.globalArc}` : undefined,
        dna.arrangement.transitionStrategy ? `transitions: ${dna.arrangement.transitionStrategy}` : undefined,
        ...dna.arrangement.sections.map((section) => {
          const bits = [
            section.energy !== undefined ? `energy ${section.energy}/10` : undefined,
            section.density,
            section.vocalDirection,
            section.drumDirection
          ].filter(Boolean);
          return `${section.label}: ${bits.join("; ")}`;
        })
      ].filter((line): line is string => Boolean(line))
    : [];

  return [
    "Composition DNA:",
    ...compositionLines.map((line) => `- ${line}`),
    "Lyric constraints (words and perspective only — not sonic):",
    ...lyricLines.map((line) => `- ${line}`),
    "Resolved Sonic DNA (intended final sonic identity):",
    ...sonicLines.map((line) => `- ${line}`),
    ...(harmonyLines.length > 0 ? ["Harmony DNA (descriptive guidance, not exact concert harmony):", ...harmonyLines.map((line) => `- ${line}`)] : []),
    ...(exclusionLines.length > 0 ? ["Sonic constraints (exclusions — never copy lyric avoid-words here):", ...exclusionLines.map((line) => `- ${line}`)] : []),
    ...(arrangementLines.length > 0
      ? [
          "Arrangement DNA (section intensity and production behavior — not mastering loudness):",
          ...arrangementLines.map((line) => `- ${line}`)
        ]
      : []),
    ...(referenceLine ? [`Reference influence: ${referenceLine}`] : [])
  ].join("\n");
}

export function toPromptSongDNA(dna: SongDNA): Omit<SongDNA, "reference"> & {
  reference?: ReturnType<typeof promptSafeSongDNAReference>;
} {
  const { reference, ...rest } = dna;
  return {
    ...rest,
    ...(reference ? { reference: promptSafeSongDNAReference(reference) } : {})
  };
}

export function formatSongDNAPlainText(dna: SongDNA): string {
  return formatSongDNAForPrompt(dna);
}

export function listFilledSonicFields(sonic: SonicDNA): Array<[keyof SonicDNA, string]> {
  const rows: Array<[keyof SonicDNA, string]> = [];
  for (const [key, value] of Object.entries(sonic) as Array<[keyof SonicDNA, SonicDNA[keyof SonicDNA]]>) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      rows.push([key, value.join(", ")]);
      continue;
    }
    if (typeof value === "object" && value !== null && "min" in value && "max" in value) {
      rows.push([key, `${value.min}–${value.max}`]);
      continue;
    }
    rows.push([key, String(value)]);
  }
  return rows;
}

export function hasSonicControlOverrides(controls: SongArchitectSonicControls): boolean {
  return Boolean(
    typeof controls.bpm === "number" ||
      controls.groove?.trim() ||
      controls.instrumentFocus?.trim() ||
      controls.productionEra?.trim() ||
      controls.productionTexture?.trim()
  );
}
