import type {
  SongArchitectSonicControls,
  SongDNAGenreFamily,
  SonicDNA
} from "@/lib/song-architect/types";
import type { EmotionalSonicExpression } from "@/lib/song-architect/emotion-translation";

type SonicProfile = Omit<SonicDNA, "emotionalSonicExpression">;

const FAMILY_PROFILES: Record<Exclude<SongDNAGenreFamily, "generic">, SonicProfile> = {
  edm: {
    primaryGenre: "EDM",
    subgenres: ["festival dance"],
    bpm: 128,
    bpmRange: { min: 124, max: 132 },
    tempoFeel: "driving four-on-the-floor",
    groove: "straight kick grid with offbeat lift into the drop",
    coreInstrumentation: ["kick", "bass", "lead synth"],
    supportingInstrumentation: ["risers", "fx", "pads"],
    drumCharacter: "punchy four-on-the-floor with sparse verse hats",
    bassCharacter: "sidechained low-end locked to the kick",
    harmonicCharacter: "stacked synth voicings that tense into the drop",
    vocalDelivery: "anthemic topline with short punch lines",
    vocalRegister: "mid-to-high",
    vocalTexture: "processed and bright",
    vocalLayering: "doubles and stacks into the drop",
    productionAesthetic: "festival-ready, wide stereo",
    productionEra: "2010s-2020s dance",
    distortionSaturation: "tasteful clip and lead saturation",
    ambience: "gated fx with short tails in the drop",
    spatialCharacter: "narrower verse, wide drop and chorus",
    dynamics: "restrained verse into explosive drop"
  },
  "hip-hop": {
    primaryGenre: "hip-hop",
    subgenres: ["contemporary rap"],
    bpm: 140,
    bpmRange: { min: 70, max: 160 },
    tempoFeel: "pocketed head-nod",
    groove: "swung hats over a dry kick-and-snare pocket",
    coreInstrumentation: ["drums", "808", "lead vocal"],
    supportingInstrumentation: ["sparse keys", "sample chop"],
    drumCharacter: "tight kick, rolling hats, snappy snare",
    bassCharacter: "808 slides with sub-focused weight",
    harmonicCharacter: "minimal loop with restrained harmonic motion",
    vocalDelivery: "rhythmic, close-mic, punchy",
    vocalRegister: "mid",
    vocalTexture: "present and dry in verses",
    vocalLayering: "ad-libs and stacked hook doubles",
    productionAesthetic: "dry verses, wetter hook",
    productionEra: "contemporary",
    distortionSaturation: "808 grit and light vocal edge",
    ambience: "short room with delay throws on the hook",
    spatialCharacter: "centered verse, wider hook",
    dynamics: "verse pressure into hook lift"
  },
  "nu-metal": {
    primaryGenre: "nu-metal",
    subgenres: ["rap-rock", "industrial-tinged metal"],
    bpm: 96,
    bpmRange: { min: 88, max: 112 },
    tempoFeel: "heavy midtempo",
    groove: "half-time verses with a double-time lift",
    coreInstrumentation: ["downtuned guitars", "drums", "bass"],
    supportingInstrumentation: ["industrial textures", "sample stabs"],
    drumCharacter: "tight kick, aggressive snare, half-time pocket",
    bassCharacter: "distorted bass locked to the guitar riff",
    harmonicCharacter: "dropped-tuning riffs with tense, repeating cells",
    vocalDelivery: "aggressive-to-melodic contrast",
    vocalRegister: "low-to-mid",
    vocalTexture: "grit with melodic release",
    vocalLayering: "gang vocals and stacked hook shouts",
    productionAesthetic: "compressed, weighty, modern-heavy",
    productionEra: "late-90s/2000s revival",
    distortionSaturation: "high guitar saturation and amp grind",
    ambience: "dry verses, larger chorus room",
    spatialCharacter: "tight verse image, wider chorus",
    dynamics: "crush-and-release across the form"
  },
  pop: {
    primaryGenre: "pop",
    subgenres: ["radio pop"],
    bpm: 108,
    bpmRange: { min: 100, max: 120 },
    tempoFeel: "midtempo bounce",
    groove: "straight, dance-adjacent pocket",
    coreInstrumentation: ["drums", "bass", "keys", "lead vocal"],
    supportingInstrumentation: ["pads", "perc", "fx"],
    drumCharacter: "clean punch with a chorus lift",
    bassCharacter: "melodic, supportive low end",
    harmonicCharacter: "bright diatonic motion with a chorus lift",
    vocalDelivery: "clean, conversational-melodic",
    vocalRegister: "mid",
    vocalTexture: "polished and present",
    vocalLayering: "doubles and stacks on the chorus",
    productionAesthetic: "radio-ready polish",
    productionEra: "contemporary",
    distortionSaturation: "light mix glue",
    ambience: "tasteful plate and room",
    spatialCharacter: "intimate verse, wide chorus",
    dynamics: "measured lift into the hook"
  },
  acoustic: {
    primaryGenre: "acoustic singer-songwriter",
    subgenres: ["folk-adjacent"],
    bpm: 82,
    bpmRange: { min: 70, max: 96 },
    tempoFeel: "unhurried, breath-led",
    groove: "organic pulse with slight rubato",
    coreInstrumentation: ["acoustic guitar", "lead vocal"],
    supportingInstrumentation: ["light piano", "subtle strings"],
    drumCharacter: "brushes or minimal percussion",
    bassCharacter: "warm, understated support",
    harmonicCharacter: "open voicings and folk-adjacent movement",
    vocalDelivery: "intimate, close, conversational",
    vocalRegister: "mid",
    vocalTexture: "natural and unprocessed",
    vocalLayering: "light chorus harmony",
    productionAesthetic: "dry-to-warm, performance-first",
    productionEra: "timeless contemporary folk",
    distortionSaturation: "minimal",
    ambience: "natural room",
    spatialCharacter: "close and centered",
    dynamics: "performance-led swells"
  },
  reggaeton: {
    primaryGenre: "reggaeton",
    subgenres: ["dembow", "latin urban"],
    bpm: 95,
    bpmRange: { min: 90, max: 100 },
    tempoFeel: "midtempo dembow",
    groove: "syncopated dembow",
    coreInstrumentation: ["dembow drums", "bass", "lead vocal"],
    supportingInstrumentation: ["tropical percussion", "synth stabs"],
    drumCharacter: "kick-snare dembow pattern",
    bassCharacter: "rounded, syncopated low end",
    harmonicCharacter: "minor or modal loops with short turnarounds",
    vocalDelivery: "rhythmic-melodic and hook-forward",
    vocalRegister: "mid",
    vocalTexture: "present, slightly dry",
    vocalLayering: "hook stacks and ad-libs",
    productionAesthetic: "club-ready latin urban",
    productionEra: "2010s-2020s",
    distortionSaturation: "light vocal and bass grit",
    ambience: "short club room",
    spatialCharacter: "centered groove, wider hook",
    dynamics: "steady body with hook lift"
  },
  rock: {
    primaryGenre: "rock",
    bpm: 118,
    bpmRange: { min: 100, max: 140 },
    tempoFeel: "forward midtempo drive",
    groove: "straight backbeat with punchy downbeats",
    coreInstrumentation: ["electric guitar", "drums", "bass", "lead vocal"],
    supportingInstrumentation: ["second guitar", "keys"],
    drumCharacter: "live kit with a firm snare backbeat",
    bassCharacter: "pick or finger attack locked to the kick",
    harmonicCharacter: "power-chord motion with chorus lift",
    vocalDelivery: "punchy, chest-forward",
    vocalRegister: "mid",
    vocalTexture: "grit with melodic sustain",
    vocalLayering: "chorus doubles and gang answers",
    productionAesthetic: "band-in-the-room, modern punch",
    productionEra: "contemporary rock",
    distortionSaturation: "amp saturation on guitars",
    ambience: "room mics with controlled tails",
    spatialCharacter: "wide guitars, centered vocal and kick",
    dynamics: "verse punch into bigger chorus"
  },
  rnb: {
    primaryGenre: "R&B",
    bpm: 92,
    bpmRange: { min: 70, max: 110 },
    tempoFeel: "laid-back pocket",
    groove: "behind-the-beat bounce",
    coreInstrumentation: ["keys", "bass", "drums", "lead vocal"],
    supportingInstrumentation: ["pads", "guitar chops"],
    drumCharacter: "soft-attack kick with swung hats",
    bassCharacter: "round, melodic low end",
    harmonicCharacter: "extended chords and smooth voice-leading",
    vocalDelivery: "melismatic, intimate, rhythmic",
    vocalRegister: "mid-to-high",
    vocalTexture: "silky and close",
    vocalLayering: "harmony stacks and whispered doubles",
    productionAesthetic: "warm, polished, late-night",
    productionEra: "contemporary",
    distortionSaturation: "gentle tape or tube glue",
    ambience: "dark plate and short room",
    spatialCharacter: "close vocal, wide pads",
    dynamics: "slow bloom into the hook"
  },
  ballad: {
    primaryGenre: "ballad",
    bpm: 72,
    bpmRange: { min: 64, max: 84 },
    tempoFeel: "slow and spacious",
    groove: "held pulse with room to breathe",
    coreInstrumentation: ["piano", "lead vocal", "strings"],
    supportingInstrumentation: ["pads", "light percussion"],
    drumCharacter: "sparse, soft-attack pulse",
    bassCharacter: "sustained, supportive low end",
    harmonicCharacter: "wide voicings with slow harmonic rhythm",
    vocalDelivery: "breathy, intimate, cinematic",
    vocalRegister: "mid",
    vocalTexture: "air and sustain",
    vocalLayering: "late-chorus harmony",
    productionAesthetic: "cinematic and spacious",
    productionEra: "contemporary cinematic",
    distortionSaturation: "minimal",
    ambience: "long hall and lush tails",
    spatialCharacter: "intimate start, wide final chorus",
    dynamics: "gradual emotional rise"
  }
};

const FAMILY_MATCHERS: Array<{ family: Exclude<SongDNAGenreFamily, "generic">; patterns: RegExp[] }> = [
  { family: "nu-metal", patterns: [/\bnu[-\s]?metal\b/, /\bnü[-\s]?metal\b/, /\bnumetal\b/] },
  { family: "reggaeton", patterns: [/\breggaeton\b/, /\bdembow\b/, /\blatin urban\b/, /\burban latino\b/] },
  {
    family: "acoustic",
    patterns: [/\bacoustic\b/, /\bsinger[-\s]?songwriter\b/, /\bfolk acoustic\b/, /\bunplugged\b/]
  },
  {
    family: "edm",
    patterns: [
      /\bedm\b/,
      /\bfestival\b/,
      /\bhouse\b/,
      /\btrance\b/,
      /\bdubstep\b/,
      /\btechno\b/,
      /\bdrum(?:\s+and\s+|\s*&\s*|\s+n\s+)bass\b/,
      /\bdnb\b/,
      /\belectro\b/
    ]
  },
  {
    family: "hip-hop",
    patterns: [/\bhip[-\s]?hop\b/, /\brap\b/, /\btrap\b/, /\bboom[-\s]?bap\b/, /\bdrill\b/]
  },
  { family: "rnb", patterns: [/\br&b\b/, /\brnb\b/, /\bsoul\b/, /\bquiet storm\b/] },
  { family: "ballad", patterns: [/\bballad\b/] },
  { family: "rock", patterns: [/\brock\b/, /\balt[-\s]?rock\b/, /\bpunk\b/, /\bindie rock\b/] },
  { family: "pop", patterns: [/\bpop\b/, /\bradio pop\b/, /\balt pop\b/, /\bsynthpop\b/] }
];

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

export function detectGenreFamily(genre: string): SongDNAGenreFamily {
  const haystack = genre.trim().toLowerCase();
  if (!haystack) return "generic";
  for (const matcher of FAMILY_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(haystack))) {
      return matcher.family;
    }
  }
  return "generic";
}

function inferSubgenres(genre: string, family: SongDNAGenreFamily, profile?: SonicProfile): string[] | undefined {
  const haystack = genre.trim().toLowerCase();
  const extras: string[] = [];
  if (/\btrap\b/.test(haystack)) extras.push("trap");
  if (/\bhouse\b/.test(haystack)) extras.push("house");
  if (/\btrance\b/.test(haystack)) extras.push("trance");
  if (/\bfestival\b/.test(haystack)) extras.push("festival");
  if (/\bdrill\b/.test(haystack)) extras.push("drill");
  if (/\bindie\b/.test(haystack)) extras.push("indie");
  if (/\bfolk\b/.test(haystack)) extras.push("folk");
  const base = profile?.subgenres ?? [];
  const merged = [...base, ...extras].filter((item, index, all) => all.indexOf(item) === index);
  if (family === "generic" && extras.length === 0) return undefined;
  return merged.length > 0 ? merged : undefined;
}

function overlayVocalStyle(profile: SonicProfile, vocalStyle: string): Partial<SonicDNA> {
  const text = vocalStyle.toLowerCase();
  if (!text.trim()) return {};
  const overlay: Partial<SonicDNA> = { vocalDelivery: vocalStyle };
  if (/\bbreathy\b|\bintimate\b|\bwhisper/.test(text)) {
    overlay.vocalTexture = "breathy and close";
    overlay.vocalRegister = overlay.vocalRegister ?? "mid";
  }
  if (/\bgritty\b|\braspy\b|\baggressive\b|\bpunchy\b/.test(text)) {
    overlay.vocalTexture = "gritty and present";
  }
  if (/\banthemic\b|\bbelting\b|\bpower\b/.test(text)) {
    overlay.vocalRegister = "mid-to-high";
    overlay.vocalLayering = overlay.vocalLayering ?? "stacked chorus lift";
  }
  if (/\brhythmic\b|\brapped\b|\bspoken\b/.test(text)) {
    overlay.vocalDelivery = vocalStyle;
  }
  if (/\bclean\b|\bmelodic\b|\bdirect\b/.test(text)) {
    overlay.vocalTexture = overlay.vocalTexture ?? "clean and direct";
  }
  return overlay;
}

function overlayEmotion(profile: SonicProfile, expression: EmotionalSonicExpression): Partial<SonicDNA> {
  const harmonicBlend = [profile.harmonicCharacter, expression.tonalTendency, expression.harmonicMotion]
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .join("; ");
  return {
    ...(harmonicBlend ? { harmonicCharacter: harmonicBlend } : {}),
    emotionalSonicExpression: expression.summary
  };
}

function applyInstrumentFocus(profile: SonicProfile, instrumentFocus?: string): Partial<SonicDNA> {
  if (!instrumentFocus?.trim()) return {};
  const focus = instrumentFocus.trim();
  const core = [focus, ...(profile.coreInstrumentation ?? []).filter((item) => item.toLowerCase() !== focus.toLowerCase())];
  return { coreInstrumentation: core };
}

function applyProductionTexture(texture?: string): Partial<SonicDNA> {
  if (!texture?.trim()) return {};
  const value = texture.trim();
  const lower = value.toLowerCase();
  const overlay: Partial<SonicDNA> = { distortionSaturation: value };
  if (/\btape\b|\bwarm\b|\bsaturat/.test(lower)) {
    overlay.ambience = overlay.ambience ?? "warm analog space";
  }
  if (/\bdry\b|\braw\b/.test(lower)) {
    overlay.ambience = "dry, close space";
  }
  if (/\blush\b|\bwash\b|\breverb/.test(lower)) {
    overlay.ambience = "lush, wet space";
  }
  return overlay;
}

export function inferSonicDNA(args: {
  genre: string;
  vocalStyle: string;
  energyCurve: string;
  lineDensity: "sparse" | "balanced" | "dense";
  userNotes?: string;
  expression: EmotionalSonicExpression;
  controls?: SongArchitectSonicControls;
}): { sonic: SonicDNA; family: SongDNAGenreFamily; userOverrides: Array<keyof SongArchitectSonicControls> } {
  const family = detectGenreFamily(args.genre);
  const profile = family === "generic" ? undefined : FAMILY_PROFILES[family];
  const userOverrides = (Object.keys(args.controls ?? {}) as Array<keyof SongArchitectSonicControls>).filter(
    (key) => {
      const value = args.controls?.[key];
      return value !== undefined && value !== null && String(value).trim().length > 0;
    }
  );

  const genericBase: SonicProfile = {
    primaryGenre: args.genre.trim() || "contemporary",
    ...(args.vocalStyle.trim() ? { vocalDelivery: args.vocalStyle.trim() } : {})
  };

  const base = profile ?? genericBase;
  const emotionOverlay = overlayEmotion(base, args.expression);
  const vocalOverlay = overlayVocalStyle(base, args.vocalStyle);
  const instrumentOverlay = applyInstrumentFocus(base, args.controls?.instrumentFocus);
  const textureOverlay = applyProductionTexture(args.controls?.productionTexture);

  const bpm = typeof args.controls?.bpm === "number" ? args.controls.bpm : base.bpm;
  const groove = args.controls?.groove?.trim() || base.groove;
  const productionEra = args.controls?.productionEra?.trim() || base.productionEra;

  const merged: SonicDNA = compactSonic({
    ...base,
    subgenres: inferSubgenres(args.genre, family, profile),
    ...emotionOverlay,
    ...vocalOverlay,
    ...instrumentOverlay,
    ...textureOverlay,
    ...(bpm !== undefined ? { bpm } : {}),
    ...(groove ? { groove } : {}),
    ...(productionEra ? { productionEra } : {}),
    ...(base.dynamics || args.energyCurve.trim() ? { dynamics: base.dynamics ?? args.energyCurve } : {}),
    emotionalSonicExpression: args.expression.summary
  });

  if (args.lineDensity === "sparse" && merged.vocalLayering) {
    merged.vocalLayering = "sparse lead with selective hook stacks";
  }
  if (args.lineDensity === "dense" && family === "hip-hop") {
    merged.vocalDelivery = merged.vocalDelivery ?? "dense rhythmic phrasing";
  }

  if (args.userNotes && /\bno drums\b|\bundrummed\b|\bunplugged\b/i.test(args.userNotes) && family === "acoustic") {
    delete merged.drumCharacter;
  }

  return { sonic: compactSonic(merged), family, userOverrides };
}
