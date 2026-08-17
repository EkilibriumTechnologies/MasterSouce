import type { EmotionalSonicExpression } from "@/lib/song-architect/emotion-translation";
import type { HarmonyDNA, SongDNAGenreFamily, SonicDNA } from "@/lib/song-architect/types";

type HarmonyProfile = Omit<HarmonyDNA, "tonalCenter" | "scaleOrMode">;

const FAMILY_HARMONY: Record<Exclude<SongDNAGenreFamily, "generic">, HarmonyProfile> = {
  edm: {
    modeTendency: "minor or lifted modal color",
    harmonicCharacter: "sustained synth voicings with tension that leans into the drop",
    chordLanguage: "held pads and stacked voicings rather than busy changes",
    progressionTendencies: "sparse movement that reserves lift for the drop",
    harmonicRhythm: "long-held harmony with rhythmic interest in the arrangement",
    tensionRelease: "build tension through the pre-drop, release on the drop",
    verseBehavior: "thinner, more static harmony under the topline",
    preChorusBehavior: "rising tension, brighter or denser voicings",
    chorusBehavior: "hook-supporting lift; if a drop follows, keep the chord bed wide and simple",
    bridgeOrDropBehavior: "drop as harmonic release — sustained, anthemic, not a new song",
    resolutionBehavior: "delayed resolution until the drop or final chorus"
  },
  "hip-hop": {
    modeTendency: "minor or modal loop color",
    harmonicCharacter: "sparse, loop-based movement over a sample or chord bed",
    chordLanguage: "short repeating cells, often with one color throughout",
    progressionTendencies: "little functional travel; the loop is the harmony",
    harmonicRhythm: "slow or static, leaving space for vocal rhythm",
    tensionRelease: "tension from arrangement and vocal cadence more than chord change",
    verseBehavior: "same bed as the hook, or a slightly drier reduction",
    preChorusBehavior: "optional filter or lift; avoid a pop-style modulation unless asked",
    chorusBehavior: "same loop, more open and chantable",
    bridgeOrDropBehavior: "breakdown or beat switch, not a new key center",
    resolutionBehavior: "loop return rather than a classical cadence"
  },
  "nu-metal": {
    modeTendency: "minor and modal, often darker than functional pop",
    harmonicCharacter: "riff-centered tonality with pedal tones and tense repeating cells",
    chordLanguage: "power-interval and modal riffs more than jazz extensions",
    progressionTendencies: "ostinato riffs; chorus may open into a more sung progression",
    harmonicRhythm: "riff-locked, with more air only on melodic releases",
    tensionRelease: "crush-and-release: verse pressure, chorus or hook as the valve",
    verseBehavior: "pedal-tone or dropped-tuning riff under rhythmic vocal",
    preChorusBehavior: "tighten the riff or thin the arrangement to raise pressure",
    chorusBehavior: "slightly more open harmony under a singable or shouted hook",
    bridgeOrDropBehavior: "breakdown, half-time, or industrial bed — contrast by texture",
    resolutionBehavior: "return to the riff; avoid tidy pop cadences unless the hook needs them"
  },
  pop: {
    modeTendency: "clear major or minor center with functional travel",
    harmonicCharacter: "hook-supporting progressions with a noticeable chorus lift",
    chordLanguage: "familiar pop motion, light color tones only if they serve the hook",
    progressionTendencies: "strong functional movement into and around the chorus",
    harmonicRhythm: "regular, section-marking changes",
    tensionRelease: "pre-chorus pressure, chorus as the simplest payoff",
    verseBehavior: "simpler or more narrative harmony under detail lines",
    preChorusBehavior: "forward motion and lift into the hook",
    chorusBehavior: "clearest tonal payoff; keep the progression singable",
    bridgeOrDropBehavior: "contrast progression or thinner texture, then return home",
    resolutionBehavior: "satisfying cadence or hook loop that feels like arrival"
  },
  acoustic: {
    modeTendency: "natural major/minor with room for modal folk color",
    harmonicCharacter: "natural chord movement with restrained harmonic density",
    chordLanguage: "open voicings, folk-adjacent shapes, few stacked extensions",
    progressionTendencies: "story-led changes; do not over-compose the guitar part",
    harmonicRhythm: "breath-led, often one harmony per line or two",
    tensionRelease: "gentle lift into the chorus, not a festival drop",
    verseBehavior: "intimate, closer voicings under conversational lines",
    preChorusBehavior: "optional; a small widening is enough",
    chorusBehavior: "more open strings or a higher register, still human-scaled",
    bridgeOrDropBehavior: "sparser guitar or a shifted inversion, then home",
    resolutionBehavior: "soft authentic or plagal arrival; leave air at the end"
  },
  reggaeton: {
    modeTendency: "minor or modal loop color",
    harmonicCharacter: "loop-oriented harmony that leaves rhythmic space",
    chordLanguage: "short repeating beds, light latin or urban color",
    progressionTendencies: "turnarounds rather than long functional journeys",
    harmonicRhythm: "slow harmonic pace against a busy dembow grid",
    tensionRelease: "hook lift through vocal and arrangement, not constant chord travel",
    verseBehavior: "same loop, drier and more rhythmic",
    preChorusBehavior: "optional filter or extra perc; keep the bed familiar",
    chorusBehavior: "same loop, more open and chantable",
    bridgeOrDropBehavior: "breakdown or groove reduction, then the loop returns",
    resolutionBehavior: "loop cadence and hook return"
  },
  rock: {
    modeTendency: "minor or blues-adjacent major, riff-aware",
    harmonicCharacter: "riff-centered tonality with power-chord motion and chorus lift",
    chordLanguage: "power chords, pedal tones, and straightforward rock changes",
    progressionTendencies: "verse riff, chorus opens; avoid over-sweetening",
    harmonicRhythm: "bar-or-riff locked",
    tensionRelease: "verse punch into a bigger chorus",
    verseBehavior: "tighter riff or lower register",
    preChorusBehavior: "optional lift or drum build",
    chorusBehavior: "wider, more sung harmony",
    bridgeOrDropBehavior: "solo bed, breakdown, or key-adjacent contrast",
    resolutionBehavior: "return to the riff or a final chorus hit"
  },
  rnb: {
    modeTendency: "minor or lush major with soul color",
    harmonicCharacter: "richer extensions and smoother voice leading",
    chordLanguage: "7ths, 9ths, and passing chords used for feel, not display",
    progressionTendencies: "fluid motion that still leaves a hook center",
    harmonicRhythm: "behind-the-beat, elastic",
    tensionRelease: "slow bloom; the hook arrives as warmth more than impact",
    verseBehavior: "closer, more conversational harmony",
    preChorusBehavior: "smoother lift, extra color tone or inversion",
    chorusBehavior: "more open extensions under stacked vocal",
    bridgeOrDropBehavior: "thinner or more intimate progression, then return",
    resolutionBehavior: "soft, voice-led arrival rather than a hard slam"
  },
  ballad: {
    modeTendency: "clear major or minor center, slow to reveal",
    harmonicCharacter: "wide voicings with slow harmonic rhythm",
    chordLanguage: "open triads and tasteful suspensions",
    progressionTendencies: "patient functional movement under the story",
    harmonicRhythm: "slow; let lines breathe between changes",
    tensionRelease: "gradual rise into a wide final chorus",
    verseBehavior: "sparse piano or guitar harmony",
    preChorusBehavior: "gentle widening",
    chorusBehavior: "fuller voicings and longer sustain",
    bridgeOrDropBehavior: "intimate reduction or a shifted color, then home",
    resolutionBehavior: "earned, unhurried cadence"
  }
};

const GENERIC_HARMONY: HarmonyProfile = {
  modeTendency: "follow the emotional color of the song",
  harmonicCharacter: "clear, song-serving harmony without false precision",
  chordLanguage: "simple, memorable movement",
  progressionTendencies: "support the hook and the story",
  harmonicRhythm: "section-aware, not busy",
  tensionRelease: "build toward the chorus or payoff",
  verseBehavior: "simpler under narrative detail",
  chorusBehavior: "clearer tonal payoff",
  resolutionBehavior: "arrive without over-explaining the key"
};

function extractKeyHint(userNotes?: string): { tonalCenter: string; scaleOrMode?: string } | undefined {
  if (!userNotes?.trim()) return undefined;
  const match = userNotes.match(
    /\b(?:in\s+)?([A-G](?:#|b|sharp|flat)?)\s+(major|minor|dorian|mixolydian|phrygian|lydian|aeolian|ionian)\b/i
  );
  if (!match) return undefined;
  const note = match[1].replace(/sharp/i, "#").replace(/flat/i, "b");
  const mode = match[2].toLowerCase();
  return {
    tonalCenter: `${note} ${mode} (user-specified)`,
    scaleOrMode: `${note} ${mode}`
  };
}

function compactHarmony(harmony: HarmonyDNA): HarmonyDNA {
  const next: HarmonyDNA = {};
  for (const [key, value] of Object.entries(harmony) as Array<[keyof HarmonyDNA, string | undefined]>) {
    if (value?.trim()) next[key] = value.trim();
  }
  return next;
}

export function inferHarmonyDNA(args: {
  family: SongDNAGenreFamily;
  sonic: SonicDNA;
  expression: EmotionalSonicExpression;
  userNotes?: string;
}): HarmonyDNA {
  const profile = args.family === "generic" ? GENERIC_HARMONY : FAMILY_HARMONY[args.family];
  const keyHint = extractKeyHint(args.userNotes);
  const modeTendency = args.expression.tonalTendency ?? profile.modeTendency;
  const tensionRelease = args.expression.harmonicMotion ?? profile.tensionRelease;
  const harmonicCharacter = [profile.harmonicCharacter, args.sonic.harmonicCharacter]
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)
    .join("; ");

  return compactHarmony({
    ...profile,
    harmonicCharacter,
    modeTendency,
    tensionRelease,
    tonalCenter: keyHint?.tonalCenter ?? "descriptive tonal center — do not invent an exact concert key",
    ...(keyHint?.scaleOrMode ? { scaleOrMode: keyHint.scaleOrMode } : {})
  });
}

export function formatHarmonyDNAPlainText(harmony: HarmonyDNA): string {
  const rows: Array<[string, string | undefined]> = [
    ["tonal center", harmony.tonalCenter],
    ["mode tendency", harmony.modeTendency],
    ["scale/mode", harmony.scaleOrMode],
    ["harmonic character", harmony.harmonicCharacter],
    ["chord language", harmony.chordLanguage],
    ["progression", harmony.progressionTendencies],
    ["harmonic rhythm", harmony.harmonicRhythm],
    ["tension/release", harmony.tensionRelease],
    ["verse", harmony.verseBehavior],
    ["pre-chorus", harmony.preChorusBehavior],
    ["chorus", harmony.chorusBehavior],
    ["bridge/drop", harmony.bridgeOrDropBehavior],
    ["resolution", harmony.resolutionBehavior]
  ];
  return rows
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

export function listFilledHarmonyFields(harmony: HarmonyDNA): Array<[keyof HarmonyDNA, string]> {
  return (Object.entries(harmony) as Array<[keyof HarmonyDNA, string | undefined]>)
    .filter((entry): entry is [keyof HarmonyDNA, string] => Boolean(entry[1]))
    .map(([key, value]) => [key, value]);
}
