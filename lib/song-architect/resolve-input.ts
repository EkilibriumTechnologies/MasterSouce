import { getSongArchitectPresetById } from "@/lib/song-architect/presets";
import { parseSongArchitectSongLength } from "@/lib/song-architect/song-length";
import type { SongArchitectInput, SongArchitectResolvedInput } from "@/lib/song-architect/types";

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
  mustInclude: [],
  avoidWords: [],
  userNotes: ""
};

function sanitizeText(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
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
    ...(sanitizeText(input.userNotes, 700) ? { userNotes: sanitizeText(input.userNotes, 700)! } : {})
  };

  return {
    resolved: merged,
    ...(preset ? { presetUsed: preset.id } : {})
  };
}
