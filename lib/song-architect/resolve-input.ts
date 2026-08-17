import { getSongArchitectPresetById } from "@/lib/song-architect/presets";
import { isReferenceSourceType } from "@/lib/song-architect/reference-dna";
import { parseSongArchitectSongLength } from "@/lib/song-architect/song-length";
import type {
  ReferenceSource,
  SongArchitectInput,
  PronunciationOverride,
  SongArchitectResolvedInput,
  SongArchitectSonicControls
} from "@/lib/song-architect/types";

const DEFAULT_RESOLVED_INPUT: SongArchitectResolvedInput = {
  songLength: "standard",
  genre: "pop",
  theme: "self-reinvention after a hard season",
  angle: "from self-doubt to decisive momentum",
  emotion: "confident and uplifted",
  hookIdentity: "One line that sounds like a personal anthem",
  structure: "Verse 1 > Pre-Chorus > Chorus > Verse 2 > Bridge > Final Chorus",
  energyCurve: "medium intro, strong chorus lift, biggest final chorus",
  language: "English",
  vocalStyle: "modern melodic lead with conversational phrasing",
  lineDensity: "balanced",
  referenceArtists: [],
  references: [],
  mustInclude: [],
  avoidWords: [],
  userNotes: "",
  sonicControls: {},
  pronunciationOverrides: []
};

function sanitizeText(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function sanitizeSonicControls(value: SongArchitectSonicControls | undefined): SongArchitectSonicControls {
  if (!value) return {};
  const bpm = typeof value.bpm === "number" && Number.isFinite(value.bpm) ? Math.round(value.bpm) : undefined;
  const clampedBpm = bpm !== undefined ? Math.min(240, Math.max(40, bpm)) : undefined;
  return {
    ...(clampedBpm !== undefined ? { bpm: clampedBpm } : {}),
    ...(sanitizeText(value.groove, 80) ? { groove: sanitizeText(value.groove, 80) } : {}),
    ...(sanitizeText(value.instrumentFocus, 80) ? { instrumentFocus: sanitizeText(value.instrumentFocus, 80) } : {}),
    ...(sanitizeText(value.productionEra, 60) ? { productionEra: sanitizeText(value.productionEra, 60) } : {}),
    ...(sanitizeText(value.productionTexture, 80) ? { productionTexture: sanitizeText(value.productionTexture, 80) } : {})
  };
}

function sanitizeReferences(value: ReferenceSource[] | undefined): ReferenceSource[] {
  if (!value || value.length === 0) return [];
  return value
    .filter((source) => source && isReferenceSourceType(source.type) && source.label?.trim())
    .map((source) => ({
      type: source.type,
      label: source.label.trim().slice(0, 80)
    }))
    .slice(0, 6);
}

function sanitizePronunciationOverrides(value: PronunciationOverride[] | undefined): PronunciationOverride[] {
  if (!value || value.length === 0) return [];
  return value
    .map((entry) => ({
      word: entry.word?.trim().slice(0, 80) ?? "",
      pronunciation: entry.pronunciation?.trim().slice(0, 120) ?? "",
      ...(entry.reason?.trim() ? { reason: entry.reason.trim().slice(0, 160) } : {})
    }))
    .filter((entry) => entry.word.length > 0 && entry.pronunciation.length > 0)
    .slice(0, 24);
}

function sanitizeStringArray(value: string[] | undefined, maxItems: number, itemMaxLength: number): string[] | undefined {
  if (!value || value.length === 0) return undefined;
  const cleaned = value
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => item.slice(0, itemMaxLength))
    .slice(0, maxItems);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function resolveSongArchitectInput(input: SongArchitectInput): {
  resolved: SongArchitectResolvedInput;
  presetUsed?: string;
} {
  const preset = getSongArchitectPresetById(input.preset);
  const merged: SongArchitectResolvedInput = {
    ...DEFAULT_RESOLVED_INPUT,
    ...(preset?.defaults ?? {}),
    ...(input.preset ? { preset: input.preset } : {}),
    songLength: parseSongArchitectSongLength(input.songLength),
    ...(sanitizeText(input.genre, 40) ? { genre: sanitizeText(input.genre, 40)! } : {}),
    ...(sanitizeText(input.theme, 160) ? { theme: sanitizeText(input.theme, 160)! } : {}),
    ...(sanitizeText(input.angle, 160) ? { angle: sanitizeText(input.angle, 160)! } : {}),
    ...(sanitizeText(input.emotion, 100) ? { emotion: sanitizeText(input.emotion, 100)! } : {}),
    ...(sanitizeText(input.hookIdentity, 160) ? { hookIdentity: sanitizeText(input.hookIdentity, 160)! } : {}),
    ...(sanitizeText(input.structure, 220) ? { structure: sanitizeText(input.structure, 220)! } : {}),
    ...(sanitizeText(input.energyCurve, 180) ? { energyCurve: sanitizeText(input.energyCurve, 180)! } : {}),
    ...(sanitizeText(input.language, 40) ? { language: sanitizeText(input.language, 40)! } : {}),
    ...(sanitizeText(input.vocalStyle, 140) ? { vocalStyle: sanitizeText(input.vocalStyle, 140)! } : {}),
    ...(input.lineDensity ? { lineDensity: input.lineDensity } : {}),
    ...(sanitizeStringArray(input.referenceArtists, 6, 80) ? { referenceArtists: sanitizeStringArray(input.referenceArtists, 6, 80)! } : {}),
    ...(sanitizeStringArray(input.mustInclude, 8, 80) ? { mustInclude: sanitizeStringArray(input.mustInclude, 8, 80)! } : {}),
    ...(sanitizeStringArray(input.avoidWords, 10, 60) ? { avoidWords: sanitizeStringArray(input.avoidWords, 10, 60)! } : {}),
    ...(sanitizeText(input.userNotes, 700) ? { userNotes: sanitizeText(input.userNotes, 700)! } : {}),
    sonicControls: sanitizeSonicControls(input.sonicControls),
    pronunciationOverrides: sanitizePronunciationOverrides(input.pronunciationOverrides)
  };

  const explicitReferences = sanitizeReferences(input.references);
  const artistSources = merged.referenceArtists.map((label) => ({ type: "artist" as const, label }));
  merged.references = explicitReferences.length > 0 ? explicitReferences : artistSources;
  if (merged.referenceArtists.length === 0) {
    merged.referenceArtists = merged.references.filter((source) => source.type === "artist").map((source) => source.label);
  }

  return {
    resolved: merged,
    ...(preset ? { presetUsed: preset.id } : {})
  };
}
