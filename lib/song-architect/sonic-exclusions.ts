import type { SongDNAGenreFamily, SonicDNA, SonicExclusions } from "@/lib/song-architect/types";

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

export function inferSonicExclusions(args: {
  family: SongDNAGenreFamily;
  sonic: SonicDNA;
  genre: string;
  emotion: string;
}): SonicExclusions | undefined {
  const seed = FAMILY_EXCLUSIONS[args.family];
  if (!seed) return undefined;

  const intended = intendedBlob(args.sonic, args.genre, args.emotion);
  const next: SonicExclusions = {};
  let remaining = 4;

  for (const key of EXCLUSION_KEYS) {
    if (remaining <= 0) break;
    const values = unique((seed[key] ?? []).filter((item) => clarifiesIntent(item, intended))).slice(0, remaining);
    if (values.length === 0) continue;
    next[key] = values;
    remaining -= values.length;
  }

  return hasSonicExclusions(next) ? next : undefined;
}

export function formatSonicExclusionsPlainText(exclusions: SonicExclusions): string {
  return EXCLUSION_KEYS.filter((key) => (exclusions[key] ?? []).length > 0)
    .map((key) => `${key}: ${(exclusions[key] ?? []).join(", ")}`)
    .join("\n");
}

export function listSonicExclusionItems(exclusions?: SonicExclusions): string[] {
  return exclusions ? flattenExclusions(exclusions) : [];
}
