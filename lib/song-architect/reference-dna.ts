import type {
  InferenceConfidence,
  ReferenceCharacteristicField,
  ReferenceCharacteristics,
  ReferenceDNA,
  ReferenceProfile,
  ReferenceSource,
  ReferenceSourceType,
  ResolvedReferenceTrait,
  SongArchitectResolvedInput,
  SongArchitectSonicControls,
  SongDNAGenreFamily,
  SonicDNA
} from "@/lib/song-architect/types";

const SOURCE_TYPES: ReferenceSourceType[] = ["artist", "song", "audio", "analyzed_track", "artist_dna"];

const CHARACTERISTIC_FIELDS: ReferenceCharacteristicField[] = [
  "genreLineage",
  "subgenreTendencies",
  "tempoTendencies",
  "groove",
  "drumCharacter",
  "bassCharacter",
  "instrumentation",
  "guitarCharacter",
  "synthCharacter",
  "vocalDelivery",
  "vocalRegister",
  "vocalTexture",
  "vocalLayering",
  "harmonicTendencies",
  "arrangementTendencies",
  "productionDensity",
  "distortionSaturation",
  "ambience",
  "spatialCharacter",
  "mixAesthetic",
  "energyBehavior",
  "eraInfluence"
];

const CHAR_TO_SONIC: Partial<Record<ReferenceCharacteristicField, keyof SonicDNA>> = {
  tempoTendencies: "tempoFeel",
  groove: "groove",
  drumCharacter: "drumCharacter",
  bassCharacter: "bassCharacter",
  vocalDelivery: "vocalDelivery",
  vocalRegister: "vocalRegister",
  vocalTexture: "vocalTexture",
  vocalLayering: "vocalLayering",
  harmonicTendencies: "harmonicCharacter",
  distortionSaturation: "distortionSaturation",
  ambience: "ambience",
  spatialCharacter: "spatialCharacter",
  mixAesthetic: "productionAesthetic",
  energyBehavior: "dynamics",
  eraInfluence: "productionEra"
};

const USER_LOCKED_SONIC: Partial<Record<keyof SongArchitectSonicControls, keyof SonicDNA>> = {
  bpm: "bpm",
  groove: "groove",
  productionEra: "productionEra",
  productionTexture: "distortionSaturation"
};

const CONFLICT_PAIRS: Array<[RegExp, RegExp]> = [
  [/\bacoustic\b|\bfolk\b|\bunplugged\b|\bcampfire\b/, /\bdistorted\b|\bdowntuned\b|\bmetal\b|\bindustrial\b|\bhigh-gain\b/],
  [/\bwhisper\b|\bbreathy\b|\bintimate hush\b/, /\bscream\b|\bgrowl\b|\bshouted\b/],
  [/\bglossy\b|\bradio-ready\b|\bdance-pop\b|\bcinematic pop\b|\bfestival polish\b/, /\bindustrial\b|\braw grit\b|\bweighty\b|\bguitar-forward\b|\bmodern-heavy\b/],
  [/\bfour-on-the-floor\b|\bfestival drop\b/, /\bhalf-time\b|\bdembow\b|\bboom-bap\b/],
  [/\bfalsetto\b|\bsilky\b|\bmelismatic\b/, /\bgrowl\b|\bscream\b|\baggressive\b|\bcommanding\b/],
  [/\bbright funk guitar\b|\bclean funk\b|\bclean pop\/folk guitar\b/, /\bdowntuned\b|\bamp grind\b|\bhigh-gain\b/],
  [/\b80s-tinged\b|\banalog leads\b|\bdark synths\b/, /\bpalm-muted\b|\briff-locked\b|\bhigh-gain amp\b/]
];

const GENRE_HINTS = [
  "nu-metal",
  "metal",
  "rock",
  "edm",
  "hip-hop",
  "hip hop",
  "rap",
  "pop",
  "acoustic",
  "folk",
  "reggaeton",
  "dembow",
  "r&b",
  "rnb",
  "ballad",
  "soul",
  "industrial"
] as const;

type CatalogEntry = {
  aliases: string[];
  family: Exclude<SongDNAGenreFamily, "generic">;
  characteristics: ReferenceCharacteristics;
};

const CATALOG: CatalogEntry[] = [
  {
    aliases: ["the weeknd", "weeknd", "abel tesfaye"],
    family: "pop",
    characteristics: {
      genreLineage: "dark alternative pop",
      subgenreTendencies: ["alternative R&B", "80s-tinged synth pop"],
      tempoTendencies: "midtempo nocturnal pulse",
      groove: "sleek, slightly behind-the-beat pop pocket",
      drumCharacter: "tight, atmospheric kit with restrained verse hats",
      bassCharacter: "warm synth bass with moody sustain",
      instrumentation: ["dark synths", "atmospheric pads", "tight drums"],
      synthCharacter: "80s-tinged analog leads and shadowy pads",
      vocalDelivery: "moody, melismatic, often high and intimate",
      vocalRegister: "mid-to-high, falsetto-capable",
      vocalTexture: "silky with a shadowed edge",
      vocalLayering: "stacked falsetto and whispered doubles",
      harmonicTendencies: "minor-leaning pop color with nocturnal suspensions",
      arrangementTendencies: "verse restraint into widescreen chorus bloom",
      productionDensity: "atmospheric but controlled",
      distortionSaturation: "tasteful analog grit on synths",
      ambience: "dark, spacious night-time reverb",
      spatialCharacter: "intimate vocal against a wide synth stage",
      mixAesthetic: "dark, polished, cinematic pop",
      energyBehavior: "slow-burn verses into glowing chorus lift",
      eraInfluence: "2010s dark pop with 1980s synth memory"
    }
  },
  {
    aliases: ["billie eilish", "billie"],
    family: "pop",
    characteristics: {
      genreLineage: "dark minimal pop",
      subgenreTendencies: ["art pop", "whisper-pop"],
      tempoTendencies: "unhurried midtempo",
      groove: "sparse, close, slightly off-center pocket",
      drumCharacter: "minimal, dry, close-mic percussion",
      bassCharacter: "subdued, shadowy low end",
      instrumentation: ["sparse keys", "close vocal", "minimal perc"],
      vocalDelivery: "whispered, close, conversational",
      vocalRegister: "low-to-mid",
      vocalTexture: "breathy and dry",
      vocalLayering: "selective doubles, rarely stacked",
      harmonicTendencies: "minor color with held, uneasy beds",
      arrangementTendencies: "negative space and sudden close-ups",
      productionDensity: "sparse and intimate",
      distortionSaturation: "light, textural",
      ambience: "dry-close with selective dark tails",
      spatialCharacter: "extremely close vocal image",
      mixAesthetic: "dark, minimal, headphone-intimate",
      energyBehavior: "contained pressure rather than explosion",
      eraInfluence: "late-2010s minimal pop"
    }
  },
  {
    aliases: ["fred again", "fred again..", "fred again."],
    family: "edm",
    characteristics: {
      genreLineage: "emotional UK dance",
      subgenreTendencies: ["UK garage", "house", "vocal collage"],
      tempoTendencies: "dance tempo with human rubato",
      groove: "shuffling garage bounce with intimate lift",
      drumCharacter: "swung garage drums and soft club punch",
      bassCharacter: "warm, rounded club bass",
      instrumentation: ["vocal chops", "piano", "garage drums"],
      synthCharacter: "soft pads and sentimental stabs",
      vocalDelivery: "intimate spoken-sung fragments",
      vocalRegister: "mid",
      vocalTexture: "close, human, slightly raw",
      vocalLayering: "chopped vocal collage",
      harmonicTendencies: "bittersweet major/minor lifts",
      arrangementTendencies: "diary-like builds into communal drops",
      productionDensity: "busy but emotionally clear",
      distortionSaturation: "gentle clip and tape warmth",
      ambience: "roomy club air with personal closeness",
      spatialCharacter: "close vocal memories, wide dance floor",
      mixAesthetic: "emotional club, handmade and glossy-human",
      energyBehavior: "tender verses into joyful release",
      eraInfluence: "2020s UK dance diary"
    }
  },
  {
    aliases: ["linkin park"],
    family: "nu-metal",
    characteristics: {
      genreLineage: "nu-metal / rap-rock",
      subgenreTendencies: ["rap-rock", "industrial-tinged alt metal"],
      tempoTendencies: "heavy midtempo",
      groove: "half-time verses with a double-time lift",
      drumCharacter: "tight, aggressive, electronically reinforced kit",
      bassCharacter: "distorted bass locked to the riff",
      instrumentation: ["downtuned guitars", "drums", "industrial textures"],
      guitarCharacter: "tight downtuned riffs with industrial edges",
      vocalDelivery: "rap-sung contrast into melodic chorus release",
      vocalRegister: "mid, chest-forward",
      vocalTexture: "grit against cleaner hook tone",
      vocalLayering: "gang answers and stacked chorus shouts",
      harmonicTendencies: "riff-centered minor cells with tense repetition",
      arrangementTendencies: "crush-and-release across verse/chorus",
      productionDensity: "compressed and weighty",
      distortionSaturation: "high guitar saturation and amp grind",
      ambience: "dry verses, larger chorus room",
      spatialCharacter: "tight verse image, wider chorus",
      mixAesthetic: "modern-heavy, industrial-polished",
      energyBehavior: "pressure, impact, then melodic release",
      eraInfluence: "late-90s/2000s nu-metal revival"
    }
  },
  {
    aliases: ["metallica"],
    family: "rock",
    characteristics: {
      genreLineage: "heavy metal",
      subgenreTendencies: ["thrash-adjacent metal", "riff metal"],
      tempoTendencies: "driving mid-to-fast metal pulse",
      groove: "riff-locked downbeats with gallop or stomp options",
      drumCharacter: "live metal kit with commanding snare",
      bassCharacter: "picked, riff-locked low end",
      instrumentation: ["distorted guitars", "drums", "bass"],
      guitarCharacter: "palm-muted riffs, harmonic stabs, solo lift",
      vocalDelivery: "commanding, aggressive-melodic",
      vocalRegister: "mid",
      vocalTexture: "grit and sustain",
      vocalLayering: "gang shouts on payoffs",
      harmonicTendencies: "riff-centered tonality with pedal-tone gravity",
      arrangementTendencies: "riff statements, breaks, and climax solos",
      productionDensity: "dense but riff-first",
      distortionSaturation: "high-gain amp saturation",
      ambience: "large room around a dry vocal",
      spatialCharacter: "wide guitars, centered vocal and kick",
      mixAesthetic: "weighty, aggressive, guitar-forward",
      energyBehavior: "forward drive with sectional peaks",
      eraInfluence: "classic metal through modern loudness"
    }
  },
  {
    aliases: ["ed sheeran", "sheeran"],
    family: "acoustic",
    characteristics: {
      genreLineage: "acoustic pop / singer-songwriter",
      subgenreTendencies: ["folk-pop", "loop-pedal acoustic"],
      tempoTendencies: "unhurried to midtempo story-pulse",
      groove: "organic acoustic pulse with light bounce",
      drumCharacter: "brushes, stomp, or minimal perc",
      bassCharacter: "warm, understated support",
      instrumentation: ["acoustic guitar", "lead vocal"],
      guitarCharacter: "percussive acoustic strum and folk voicings",
      vocalDelivery: "intimate, conversational, hook-clear",
      vocalRegister: "mid",
      vocalTexture: "natural and close",
      vocalLayering: "light chorus harmony",
      harmonicTendencies: "natural major/minor movement with simple cadences",
      arrangementTendencies: "story verses into singable chorus lift",
      productionDensity: "restrained and performance-led",
      distortionSaturation: "minimal",
      ambience: "natural room",
      spatialCharacter: "close and centered",
      mixAesthetic: "warm, dry-to-soft, radio-acoustic",
      energyBehavior: "gentle rise into a memorable chorus",
      eraInfluence: "2010s acoustic pop"
    }
  },
  {
    aliases: ["drake"],
    family: "hip-hop",
    characteristics: {
      genreLineage: "melodic hip-hop / atmospheric rap",
      subgenreTendencies: ["melodic rap", "atmospheric R&B-rap"],
      tempoTendencies: "slow-to-mid pocket",
      groove: "laid-back hats over a spacious kick",
      drumCharacter: "sparse trap-adjacent kit",
      bassCharacter: "deep 808 with restrained motion",
      instrumentation: ["808", "atmospheric keys", "lead vocal"],
      vocalDelivery: "half-sung, conversational, close",
      vocalRegister: "mid",
      vocalTexture: "dry-present with soft auto-tune sheen",
      vocalLayering: "ad-libs and muted doubles",
      harmonicTendencies: "loop-based minor beds with little motion",
      arrangementTendencies: "mood first, hook as atmosphere",
      productionDensity: "sparse and nocturnal",
      distortionSaturation: "light 808 grit",
      ambience: "dark, smeared tails",
      spatialCharacter: "centered vocal, wide night pads",
      mixAesthetic: "dry verse, wetter atmospheric hook",
      energyBehavior: "smolder rather than explode",
      eraInfluence: "2010s Toronto atmospheric rap"
    }
  },
  {
    aliases: ["sza"],
    family: "rnb",
    characteristics: {
      genreLineage: "contemporary alternative R&B",
      subgenreTendencies: ["alt-R&B", "soul-pop"],
      tempoTendencies: "laid-back pocket",
      groove: "behind-the-beat bounce",
      drumCharacter: "soft-attack, swung, intimate kit",
      bassCharacter: "round, melodic low end",
      instrumentation: ["keys", "bass", "silky vocal"],
      vocalDelivery: "melismatic, intimate, rhythmic",
      vocalRegister: "mid-to-high",
      vocalTexture: "silky and close",
      vocalLayering: "harmony stacks and whispered doubles",
      harmonicTendencies: "rich extensions with smooth voice leading",
      arrangementTendencies: "fluid section edges, hook as feeling",
      productionDensity: "warm and uncluttered",
      distortionSaturation: "gentle tape glue",
      ambience: "dark plate and short room",
      spatialCharacter: "close vocal, wide pads",
      mixAesthetic: "warm, late-night, polished-human",
      energyBehavior: "slow bloom into the hook",
      eraInfluence: "contemporary R&B"
    }
  },
  {
    aliases: ["bad bunny", "benito"],
    family: "reggaeton",
    characteristics: {
      genreLineage: "latin urban / reggaeton",
      subgenreTendencies: ["dembow", "latin urban"],
      tempoTendencies: "midtempo dembow",
      groove: "syncopated dembow with melodic lean",
      drumCharacter: "kick-snare dembow pattern",
      bassCharacter: "rounded, syncopated low end",
      instrumentation: ["dembow drums", "bass", "lead vocal"],
      vocalDelivery: "rhythmic-melodic and hook-forward",
      vocalRegister: "mid",
      vocalTexture: "present, slightly dry",
      vocalLayering: "hook stacks and ad-libs",
      harmonicTendencies: "loop-oriented minor or modal beds",
      arrangementTendencies: "groove loops with hook returns",
      productionDensity: "club-ready but vocal-first",
      distortionSaturation: "light vocal and bass grit",
      ambience: "short club room",
      spatialCharacter: "centered groove, wider hook",
      mixAesthetic: "modern latin urban",
      energyBehavior: "steady body with hook lift",
      eraInfluence: "2010s-2020s latin urban"
    }
  },
  {
    aliases: ["taylor swift", "taylor"],
    family: "pop",
    characteristics: {
      genreLineage: "narrative pop",
      subgenreTendencies: ["radio pop", "folk-pop"],
      tempoTendencies: "midtempo story bounce",
      groove: "straight, hook-supporting pocket",
      drumCharacter: "clean punch with chorus lift",
      bassCharacter: "melodic, supportive low end",
      instrumentation: ["drums", "guitar or piano", "lead vocal"],
      guitarCharacter: "clean pop/folk guitar when present",
      vocalDelivery: "clear, conversational-melodic",
      vocalRegister: "mid",
      vocalTexture: "polished and present",
      vocalLayering: "doubles and stacks on the chorus",
      harmonicTendencies: "strong functional movement under the hook",
      arrangementTendencies: "story verses into high-recall chorus",
      productionDensity: "radio-clear",
      distortionSaturation: "light mix glue",
      ambience: "tasteful plate and room",
      spatialCharacter: "intimate verse, wide chorus",
      mixAesthetic: "radio-ready polish",
      energyBehavior: "measured lift into the hook",
      eraInfluence: "contemporary pop"
    }
  },
  {
    aliases: ["nine inch nails", "nin", "trent reznor"],
    family: "nu-metal",
    characteristics: {
      genreLineage: "industrial rock",
      subgenreTendencies: ["industrial", "alt-electronic rock"],
      tempoTendencies: "midtempo machine pulse",
      groove: "mechanical, tense, riff-or-loop locked",
      drumCharacter: "processed industrial kit",
      bassCharacter: "distorted, grinding low end",
      instrumentation: ["industrial textures", "distorted synths", "guitars"],
      guitarCharacter: "abrasive, textural, often processed",
      synthCharacter: "harsh analog and metallic beds",
      vocalDelivery: "intimate-to-aggressive contrast",
      vocalRegister: "mid",
      vocalTexture: "dry grit with whispered closeness",
      vocalLayering: "doubled intensity on peaks",
      harmonicTendencies: "static minor cells and dissonant color",
      arrangementTendencies: "tension beds, sudden drops, industrial lifts",
      productionDensity: "dense and abrasive",
      distortionSaturation: "heavy saturation and analog destruction",
      ambience: "metallic rooms and smeared tails",
      spatialCharacter: "claustrophobic verse, wider assault",
      mixAesthetic: "dark industrial, mechanical",
      energyBehavior: "pressure and release through texture",
      eraInfluence: "90s industrial through modern dark electronic"
    }
  },
  {
    aliases: ["adele"],
    family: "ballad",
    characteristics: {
      genreLineage: "soul-pop ballad",
      subgenreTendencies: ["soul ballad", "piano pop"],
      tempoTendencies: "slow and spacious",
      groove: "held pulse with room to breathe",
      drumCharacter: "sparse, soft-attack pulse",
      bassCharacter: "sustained, supportive low end",
      instrumentation: ["piano", "lead vocal", "strings"],
      vocalDelivery: "powerful, intimate, cinematic",
      vocalRegister: "mid",
      vocalTexture: "air, grain, and sustain",
      vocalLayering: "late-chorus harmony",
      harmonicTendencies: "wide voicings with slow, functional motion",
      arrangementTendencies: "narrative rise into a wide final chorus",
      productionDensity: "vocal-first, uncluttered",
      distortionSaturation: "minimal",
      ambience: "long hall and lush tails",
      spatialCharacter: "intimate start, wide final chorus",
      mixAesthetic: "cinematic and spacious",
      energyBehavior: "gradual emotional rise",
      eraInfluence: "contemporary cinematic soul"
    }
  }
];

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function normalizeReferenceLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(the|a|an)\s+/, "")
    .trim();
}

export function isReferenceSourceType(value: string): value is ReferenceSourceType {
  return SOURCE_TYPES.includes(value as ReferenceSourceType);
}

export function toReferenceSources(input: Pick<SongArchitectResolvedInput, "referenceArtists" | "references">): ReferenceSource[] {
  const explicit = (input.references ?? []).filter((source) => source.label.trim().length > 0);
  if (explicit.length > 0) return explicit.slice(0, 6);
  return (input.referenceArtists ?? [])
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((label) => ({ type: "artist" as const, label }));
}

export function lookupReferenceProfile(source: ReferenceSource): ReferenceProfile {
  const normalized = normalizeReferenceLabel(source.label);
  const match = CATALOG.find((entry) => entry.aliases.some((alias) => normalizeReferenceLabel(alias) === normalized));
  if (!match) {
    return {
      source,
      characteristics: {},
      confidence: "optional",
      catalogMatch: false
    };
  }
  return {
    source,
    characteristics: { ...match.characteristics },
    confidence: "likely",
    catalogMatch: true
  };
}

function fieldValues(characteristics: ReferenceCharacteristics, field: ReferenceCharacteristicField): string[] {
  const value = characteristics[field];
  if (Array.isArray(value)) return uniqueStrings(value);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function phrasesConflict(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return false;
  const leftGenre = detectGenreHint(left);
  const rightGenre = detectGenreHint(right);
  if (leftGenre && rightGenre && !genreHintsCompatible(leftGenre, rightGenre)) return true;
  return CONFLICT_PAIRS.some(([one, two]) => (one.test(left) && two.test(right)) || (two.test(left) && one.test(right)));
}

function phrasesCompatible(a: string, b: string): boolean {
  if (phrasesConflict(a, b)) return false;
  const weak = new Set(["with", "from", "into", "over", "mid", "high", "low", "lead", "vocal", "tone", "color"]);
  const tokens = (value: string) =>
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !weak.has(token));
  const left = new Set(tokens(a));
  const overlap = tokens(b).filter((token) => left.has(token));
  return overlap.length >= 2 || overlap.some((token) => token.length >= 7);
}

function intentBlob(args: { genre: string; emotion: string; vocalStyle: string; energyCurve: string; structure: string }): string {
  return [args.genre, args.emotion, args.vocalStyle, args.energyCurve, args.structure].join(" ").toLowerCase();
}

function detectGenreHint(text: string): string | undefined {
  const haystack = text.toLowerCase();
  return GENRE_HINTS.find((hint) => haystack.includes(hint));
}

function genreHintsCompatible(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  const metalish = new Set(["metal", "nu-metal", "rock", "industrial"]);
  const popish = new Set(["pop", "r&b", "rnb", "soul", "ballad"]);
  const latin = new Set(["reggaeton", "dembow"]);
  const hiphop = new Set(["hip-hop", "hip hop", "rap"]);
  const acoustic = new Set(["acoustic", "folk"]);
  const groups = [metalish, popish, latin, hiphop, acoustic];
  return groups.some((group) => group.has(a) && group.has(b));
}

function alignsWithUserIntent(value: string, intent: string): boolean {
  if (phrasesConflict(value, intent)) return false;
  const valueGenre = detectGenreHint(value);
  const intentGenre = detectGenreHint(intent);
  if (valueGenre && intentGenre && !genreHintsCompatible(valueGenre, intentGenre)) return false;
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);
  if (tokens.some((token) => intent.includes(token))) return true;
  return !valueGenre || genreHintsCompatible(valueGenre, intentGenre);
}

export function buildReferenceDNA(
  sources: ReferenceSource[],
  intent: { genre: string; emotion: string; vocalStyle: string; energyCurve: string; structure: string }
): ReferenceDNA | undefined {
  if (sources.length === 0) return undefined;

  const profiles = sources.map(lookupReferenceProfile);
  const matched = profiles.filter((profile) => profile.catalogMatch);
  const intentText = intentBlob(intent);
  const sharedTraits: ResolvedReferenceTrait[] = [];
  const complementaryTraits: ResolvedReferenceTrait[] = [];
  const conflictingTraits: ResolvedReferenceTrait[] = [];

  for (const field of CHARACTERISTIC_FIELDS) {
    const contributions = matched
      .map((profile) => ({
        profile,
        values: fieldValues(profile.characteristics, field)
      }))
      .filter((entry) => entry.values.length > 0);

    if (contributions.length === 0) continue;

    const flat = contributions.flatMap((entry) =>
      entry.values.map((value) => ({ value, source: entry.profile.source.label }))
    );

    if (matched.length >= 2 && contributions.length >= 2) {
      const shared: string[] = [];
      const conflicted: string[] = [];
      for (let i = 0; i < flat.length; i += 1) {
        for (let j = i + 1; j < flat.length; j += 1) {
          if (flat[i].source === flat[j].source) continue;
          if (phrasesConflict(flat[i].value, flat[j].value)) {
            conflicted.push(flat[i].value, flat[j].value);
          } else if (flat[i].value.toLowerCase() === flat[j].value.toLowerCase() || phrasesCompatible(flat[i].value, flat[j].value)) {
            shared.push(flat[i].value, flat[j].value);
          }
        }
      }

      const uniqueShared = uniqueStrings(shared);
      const uniqueConflicted = uniqueStrings(conflicted).filter((value) => !uniqueShared.includes(value));

      if (uniqueShared.length > 0) {
        sharedTraits.push({
          field,
          value: uniqueShared[0],
          confidence: "strong",
          role: "shared",
          sources: uniqueStrings(flat.filter((item) => uniqueShared.some((value) => phrasesCompatible(item.value, value) || item.value === value)).map((item) => item.source))
        });
      }

      if (uniqueConflicted.length > 0) {
        const preferred = uniqueConflicted.find((value) => alignsWithUserIntent(value, intentText)) ?? uniqueConflicted[0];
        const discarded = uniqueConflicted.filter((value) => value !== preferred);
        conflictingTraits.push({
          field,
          value: preferred,
          confidence: "optional",
          role: "conflicting",
          sources: uniqueStrings(flat.map((item) => item.source)),
          resolution: discarded.length
            ? `User intent kept "${preferred}" and set aside ${discarded.map((value) => `"${value}"`).join(", ")}`
            : `User intent arbitrated "${preferred}"`
        });
      }

      const leftover = uniqueStrings(
        flat
          .map((item) => item.value)
          .filter((value) => !uniqueShared.some((sharedValue) => sharedValue === value || phrasesCompatible(sharedValue, value)))
          .filter((value) => !uniqueConflicted.includes(value))
      );
      for (const value of leftover.slice(0, 1)) {
        complementaryTraits.push({
          field,
          value,
          confidence: "likely",
          role: "complementary",
          sources: uniqueStrings(flat.filter((item) => item.value === value).map((item) => item.source))
        });
      }
      continue;
    }

    complementaryTraits.push({
      field,
      value: flat[0].value,
      confidence: matched.length === 1 ? "likely" : "optional",
      role: "complementary",
      sources: uniqueStrings(flat.map((item) => item.source))
    });
  }

  const influenceSummary = buildInfluenceSummary({
    profiles,
    sharedTraits,
    complementaryTraits,
    conflictingTraits
  });

  return {
    sources,
    profiles,
    sharedTraits,
    complementaryTraits,
    conflictingTraits,
    influenceSummary
  };
}

function buildInfluenceSummary(args: {
  profiles: ReferenceProfile[];
  sharedTraits: ResolvedReferenceTrait[];
  complementaryTraits: ResolvedReferenceTrait[];
  conflictingTraits: ResolvedReferenceTrait[];
}): string {
  const named = args.profiles.map((profile) => profile.source.label);
  const unmatched = args.profiles.filter((profile) => !profile.catalogMatch).map((profile) => profile.source.label);
  const parts: string[] = [];

  if (args.sharedTraits.length > 0) {
    const traits = args.sharedTraits.slice(0, 3).map((trait) => trait.value);
    parts.push(`Shared traits strengthened the direction: ${traits.join("; ")}.`);
  }
  if (args.complementaryTraits.length > 0 && args.sharedTraits.length === 0) {
    const traits = args.complementaryTraits.slice(0, 3).map((trait) => trait.value);
    parts.push(`Reference characteristics informed the sonic direction: ${traits.join("; ")}.`);
  } else if (args.complementaryTraits.length > 0) {
    parts.push("Complementary details were added only where they did not fight the core identity.");
  }
  if (args.conflictingTraits.length > 0) {
    parts.push("Conflicting reference traits were not auto-merged; user genre, emotion, vocal style, energy, and structure kept priority.");
  }
  if (unmatched.length > 0) {
    parts.push(`No catalog characteristics were forced from ${unmatched.join(", ")}.`);
  }
  if (parts.length === 0) {
    parts.push(
      named.length > 0
        ? "References were noted as inspiration, but user intent remained the sonic source of truth."
        : "No reference characteristics were applied."
    );
  }
  parts.push("The result is an original sonic direction, not artist imitation.");
  return parts.join(" ");
}

function compactSonic(sonic: SonicDNA): SonicDNA {
  const next: SonicDNA = {};
  for (const [key, value] of Object.entries(sonic) as Array<[keyof SonicDNA, SonicDNA[keyof SonicDNA]]>) {
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

function applyTraitToSonic(
  sonic: SonicDNA,
  trait: ResolvedReferenceTrait,
  locked: Set<keyof SonicDNA>
): void {
  if (trait.field === "subgenreTendencies") {
    const extras = trait.value.split(",").map((part) => part.trim()).filter(Boolean);
    sonic.subgenres = uniqueStrings([...(sonic.subgenres ?? []), ...extras]);
    return;
  }
  if (trait.field === "instrumentation" || trait.field === "guitarCharacter" || trait.field === "synthCharacter") {
    const extras = trait.value.split(",").map((part) => part.trim()).filter(Boolean);
    sonic.supportingInstrumentation = uniqueStrings([...(sonic.supportingInstrumentation ?? []), ...extras]).slice(0, 6);
    return;
  }
  if (trait.field === "genreLineage") {
    sonic.subgenres = uniqueStrings([...(sonic.subgenres ?? []), trait.value]);
    return;
  }
  if (trait.field === "arrangementTendencies" || trait.field === "productionDensity") {
    return;
  }

  const sonicKey = CHAR_TO_SONIC[trait.field];
  if (!sonicKey || locked.has(sonicKey)) return;
  const current = sonic[sonicKey];
  const atmosphereFields = new Set<ReferenceCharacteristicField>([
    "mixAesthetic",
    "ambience",
    "spatialCharacter",
    "eraInfluence",
    "distortionSaturation",
    "harmonicTendencies"
  ]);
  if (typeof current === "string" && current.trim()) {
    if (phrasesConflict(current, trait.value)) return;
    if (trait.role === "shared") {
      (sonic as Record<string, unknown>)[sonicKey] = trait.value;
      return;
    }
    if (
      trait.role === "complementary" &&
      trait.confidence === "likely" &&
      (phrasesCompatible(current, trait.value) || atmosphereFields.has(trait.field))
    ) {
      (sonic as Record<string, unknown>)[sonicKey] = trait.value;
    }
    return;
  }
  if (typeof current !== "string") {
    (sonic as Record<string, unknown>)[sonicKey] = trait.value;
  }
}

export function resolveSonicWithReferences(args: {
  sonic: SonicDNA;
  reference?: ReferenceDNA;
  userOverrides: Array<keyof SongArchitectSonicControls>;
  intent: { genre: string; emotion: string; vocalStyle: string; energyCurve: string; structure: string };
}): SonicDNA {
  if (!args.reference) return compactSonic(args.sonic);
  const next = { ...args.sonic };
  const locked = new Set<keyof SonicDNA>();
  for (const override of args.userOverrides) {
    const sonicKey = USER_LOCKED_SONIC[override];
    if (sonicKey) locked.add(sonicKey);
  }
  if (args.intent.vocalStyle.trim()) {
    locked.add("vocalDelivery");
  }

  const intentText = intentBlob(args.intent);

  for (const trait of args.reference.sharedTraits) {
    applyTraitToSonic(next, trait, locked);
  }
  for (const trait of args.reference.complementaryTraits) {
    if (trait.confidence === "optional") continue;
    applyTraitToSonic(next, trait, locked);
  }
  for (const trait of args.reference.conflictingTraits) {
    if (!trait.resolution || !alignsWithUserIntent(trait.value, intentText)) continue;
    applyTraitToSonic(next, { ...trait, role: "shared", confidence: "likely" }, locked);
  }

  if (next.primaryGenre) {
    next.primaryGenre = args.sonic.primaryGenre ?? next.primaryGenre;
  }

  return compactSonic(next);
}

export function formatReferenceDNAPlainText(reference: ReferenceDNA): string {
  const lines = [
    `Sources: ${reference.sources.map((source) => `${source.label} (${source.type})`).join(", ")}`,
    reference.influenceSummary,
    reference.sharedTraits.length > 0
      ? `Shared: ${reference.sharedTraits.slice(0, 5).map((trait) => trait.value).join("; ")}`
      : undefined,
    reference.complementaryTraits.length > 0
      ? `Complementary: ${reference.complementaryTraits.slice(0, 4).map((trait) => trait.value).join("; ")}`
      : undefined,
    reference.conflictingTraits.length > 0
      ? `Conflicts: ${reference.conflictingTraits
          .slice(0, 3)
          .map((trait) => trait.resolution ?? trait.value)
          .join("; ")}`
      : undefined
  ].filter(Boolean);
  return lines.join("\n");
}

export function formatReferenceInfluenceForPrompt(reference?: ReferenceDNA): string | undefined {
  if (!reference) return undefined;
  const parts = [
    ...reference.sharedTraits.slice(0, 3).map((trait) => trait.value),
    ...reference.complementaryTraits.slice(0, 2).map((trait) => trait.value)
  ];
  const unique = uniqueStrings(parts);
  if (unique.length === 0) return "References informed mood only; user intent remains the sonic identity.";
  return `Reference-derived characteristics (do not treat as artist imitation): ${unique.join("; ")}`;
}

export function promptSafeSongDNAReference(reference?: ReferenceDNA): Pick<
  ReferenceDNA,
  "sharedTraits" | "complementaryTraits" | "conflictingTraits"
> | undefined {
  if (!reference) return undefined;
  const stripSources = (trait: ResolvedReferenceTrait): ResolvedReferenceTrait => ({
    ...trait,
    sources: []
  });
  return {
    sharedTraits: reference.sharedTraits.map(stripSources),
    complementaryTraits: reference.complementaryTraits.map(stripSources),
    conflictingTraits: reference.conflictingTraits.map(stripSources)
  };
}
