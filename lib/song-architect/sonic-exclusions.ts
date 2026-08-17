import type {
  SongArchitectResolvedInput,
  SongDNA,
  SongDNAGenreFamily,
  SonicDNA,
  SonicExclusions
} from "@/lib/song-architect/types";

const FAMILY_EXCLUSIONS: Partial<Record<SongDNAGenreFamily, SonicExclusions>> = {
  "nu-metal": {
    productionStyles: ["glossy dance-pop production"],
    genres: ["festival EDM drops"],
    instruments: ["bright funk guitar"],
    textures: ["acoustic folk textures"]
  },
  edm: {
    textures: ["acoustic folk campfire textures"],
    instruments: ["downtuned metal riff walls"],
    arrangementBehavior: ["spoken-word folk verses"]
  },
  "hip-hop": {
    genres: ["festival EDM drops"],
    textures: ["acoustic campfire textures"],
    arrangementBehavior: ["operatic belting choruses"]
  },
  acoustic: {
    genres: ["festival EDM drops"],
    productionStyles: ["industrial distortion walls"],
    instruments: ["trap 808 flex"]
  },
  reggaeton: {
    genres: ["festival four-on-the-floor EDM"],
    textures: ["acoustic folk textures"],
    instruments: ["downtuned metal riffs"]
  },
  rock: {
    productionStyles: ["glossy tropical dance-pop"],
    textures: ["whisper-pop bedroom minimalism"]
  },
  rnb: {
    genres: ["festival EDM drops"],
    productionStyles: ["industrial nu-metal crush"]
  },
  ballad: {
    genres: ["festival EDM drops"],
    productionStyles: ["aggressive trap flex"]
  }
};

const EXCLUSION_KEYS: Array<keyof SonicExclusions> = [
  "genres",
  "subgenres",
  "instruments",
  "vocalBehavior",
  "productionStyles",
  "eras",
  "arrangementBehavior",
  "textures",
  "effects",
  "mixCharacteristics"
];

/** High-signal lyric recombinations that contradict an explicit anti-EDM-drop exclusion. */
const GENERIC_EDM_DROP_LYRIC_LEAKS = [
  /\bdance(?:\s+the)?\s+drop\b/i,
  /\bfestival\s+drop\b/i,
  /\bedm\s+drop\b/i,
  /\bhit\s+the\s+drop\b/i,
  /\binto\s+the\s+drop\b/i,
  /\bbuild(?:\s+up)?\s+(?:into|to)\s+(?:the\s+)?drop\b/i,
  /\bdrop\s+the\s+bass\b/i
];

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function flattenExclusions(exclusions: SonicExclusions): string[] {
  return unique(EXCLUSION_KEYS.flatMap((key) => exclusions[key] ?? []));
}

function intendedBlob(sonic: SonicDNA, genre: string, emotion: string): string {
  return [
    genre,
    emotion,
    sonic.primaryGenre,
    ...(sonic.subgenres ?? []),
    sonic.groove,
    sonic.productionAesthetic,
    sonic.coreInstrumentation?.join(" "),
    sonic.vocalDelivery
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function clarifiesIntent(item: string, intended: string): boolean {
  const lower = item.toLowerCase();
  const tokens = lower.split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  const overlap = tokens.filter((token) => intended.includes(token));
  if (overlap.length >= 2) return false;
  return true;
}

export function hasSonicExclusions(exclusions?: SonicExclusions): boolean {
  if (!exclusions) return false;
  return flattenExclusions(exclusions).length > 0;
}

export function mergeSonicExclusions(
  ...parts: Array<SonicExclusions | undefined>
): SonicExclusions | undefined {
  const next: SonicExclusions = {};
  for (const part of parts) {
    if (!part) continue;
    for (const key of EXCLUSION_KEYS) {
      const values = unique([...(next[key] ?? []), ...(part[key] ?? [])]);
      if (values.length > 0) next[key] = values;
    }
  }
  return hasSonicExclusions(next) ? next : undefined;
}

/**
 * Detect explicit user directions against generic/festival EDM-drop behavior.
 * Does not treat every mention of "drop" as negative.
 */
export function extractExplicitDropExclusionsFromNotes(userNotes: string): SonicExclusions | undefined {
  const text = userNotes.trim();
  if (!text) return undefined;

  const negatedDrop =
    /\b(?:no|avoid|without|never|not)\b[\s\S]{0,48}\b(?:generic\s+)?(?:festival[-\s]?)?(?:style\s+)?(?:edm\s+)?drop(?:s)?(?:\s+behavior|\s+structure|\s+language)?\b/i.test(
      text
    ) ||
    /\b(?:continuous\s+)?dembow\b[\s\S]{0,40}\brather than\b[\s\S]{0,40}\b(?:edm\s+)?drop\b/i.test(text) ||
    /\bavoid\b[\s\S]{0,40}\bfestival[-\s]?style\b[\s\S]{0,20}\bedm\s+drop\b/i.test(text);

  if (!negatedDrop) return undefined;

  return {
    genres: ["generic EDM drop behavior", "festival EDM drops"],
    arrangementBehavior: ["festival-style EDM drop structure"]
  };
}

export function inferSonicExclusions(args: {
  family: SongDNAGenreFamily;
  sonic: SonicDNA;
  genre: string;
  emotion: string;
  userNotes?: string;
}): SonicExclusions | undefined {
  const seed = FAMILY_EXCLUSIONS[args.family];
  const intended = intendedBlob(args.sonic, args.genre, args.emotion);
  const next: SonicExclusions = {};
  let remaining = 4;

  if (seed) {
    for (const key of EXCLUSION_KEYS) {
      if (remaining <= 0) break;
      const values = unique((seed[key] ?? []).filter((item) => clarifiesIntent(item, intended))).slice(0, remaining);
      if (values.length === 0) continue;
      next[key] = values;
      remaining -= values.length;
    }
  }

  const fromNotes = extractExplicitDropExclusionsFromNotes(args.userNotes ?? "");
  return mergeSonicExclusions(hasSonicExclusions(next) ? next : undefined, fromNotes);
}

export function formatSonicExclusionsPlainText(exclusions: SonicExclusions): string {
  return EXCLUSION_KEYS.filter((key) => (exclusions[key] ?? []).length > 0)
    .map((key) => `${key}: ${(exclusions[key] ?? []).join(", ")}`)
    .join("\n");
}

export function listSonicExclusionItems(exclusions?: SonicExclusions): string[] {
  return exclusions ? flattenExclusions(exclusions) : [];
}

export function excludesGenericEdmDropBehavior(
  songDNA: SongDNA,
  resolvedInput?: SongArchitectResolvedInput
): boolean {
  const blob = [
    ...listSonicExclusionItems(songDNA.sonicExclusions),
    resolvedInput?.userNotes ?? ""
  ]
    .join(" ")
    .toLowerCase();

  return (
    /\bgeneric\s+edm\s+drop\b/.test(blob) ||
    /\bfestival(?:[-\s]style)?\s+edm\s+drop/.test(blob) ||
    /\bfestival\s+edm\s+drops?\b/.test(blob) ||
    /\bfestival[-\s]?style\s+edm\s+drop/.test(blob) ||
    /\bno\s+generic\s+edm\s+drop/.test(blob) ||
    Boolean(extractExplicitDropExclusionsFromNotes(resolvedInput?.userNotes ?? ""))
  );
}

export function isDropPositivelyAuthorized(
  songDNA: SongDNA,
  resolvedInput?: SongArchitectResolvedInput
): boolean {
  if (songDNA.meta.genreFamily === "edm") return true;

  const structure = `${songDNA.composition.structure} ${resolvedInput?.structure ?? ""}`.toLowerCase();
  if (/\bdrop\b/.test(structure)) return true;

  const positiveFields = [
    songDNA.composition.hookIdentity,
    songDNA.composition.theme,
    songDNA.composition.angle,
    ...(songDNA.composition.mustInclude ?? []),
    resolvedInput?.hookIdentity ?? "",
    resolvedInput?.theme ?? "",
    ...(resolvedInput?.mustInclude ?? [])
  ]
    .join(" ")
    .toLowerCase();

  if (/\bdance(?:\s+the)?\s+drop\b|\bedm\s+drop\b|\bfestival\s+drop\b/.test(positiveFields)) {
    return true;
  }

  const notes = (resolvedInput?.userNotes ?? "").toLowerCase();
  if (
    /\b(?:with|include|want|need|add|use|keep)\b[\s\S]{0,24}\b(?:edm\s+)?drop\b/.test(notes) &&
    !extractExplicitDropExclusionsFromNotes(resolvedInput?.userNotes ?? "")
  ) {
    return true;
  }

  return false;
}

/**
 * Detect contradictory generic EDM-drop lyric language when an explicit exclusion is active.
 * Ordinary standalone uses of "drop" are allowed.
 */
export function detectGenericEdmDropLyricLeak(
  lyrics: string,
  songDNA: SongDNA,
  resolvedInput?: SongArchitectResolvedInput
): string | undefined {
  if (!excludesGenericEdmDropBehavior(songDNA, resolvedInput)) return undefined;
  if (isDropPositivelyAuthorized(songDNA, resolvedInput)) return undefined;

  for (const pattern of GENERIC_EDM_DROP_LYRIC_LEAKS) {
    const match = lyrics.match(pattern);
    if (match?.[0]) {
      return match[0];
    }
  }
  return undefined;
}
