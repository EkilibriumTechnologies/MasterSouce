/**
 * Translates emotional intent into musical sonic expression.
 * Genre-agnostic: the same intent yields the same musical concepts
 * regardless of style. Genre vocabulary is applied later in Sonic DNA inference.
 */

export type EmotionalSonicExpression = {
  tonalTendency?: string;
  percussionBehavior?: string;
  registerTexture?: string;
  harmonicMotion?: string;
  spatialDynamics?: string;
  summary: string;
};

type IntentCue = {
  tokens: string[];
  tonalTendency?: string;
  percussionBehavior?: string;
  registerTexture?: string;
  harmonicMotion?: string;
  spatialDynamics?: string;
};

const INTENT_CUES: IntentCue[] = [
  {
    tokens: ["dark", "shadow", "grim", "brooding", "noir", "bleak", "somber"],
    tonalTendency: "minor tonal tendencies",
    registerTexture: "low-register textures",
    harmonicMotion: "held tension with delayed resolution"
  },
  {
    tokens: ["emotional", "vulnerable", "intimate", "tender", "raw", "heartfelt", "confessional"],
    percussionBehavior: "restrained verse percussion",
    registerTexture: "close, exposed mid-register vocal",
    spatialDynamics: "intimate verse proximity"
  },
  {
    tokens: ["powerful", "anthemic", "epic", "huge", "commanding", "mighty"],
    harmonicMotion: "increasing harmonic tension",
    spatialDynamics: "chorus width expansion",
    percussionBehavior: "verse restraint into impact hits"
  },
  {
    tokens: ["confident", "assured", "decisive", "bold"],
    tonalTendency: "brighter harmonic color with stable cadences",
    registerTexture: "forward, centered vocal",
    spatialDynamics: "steady presence that opens on the hook"
  },
  {
    tokens: ["uplifted", "uplifting", "hopeful", "euphoric", "joyful", "elated", "celebratory"],
    tonalTendency: "major or lifted modal color",
    harmonicMotion: "ascending motion into the chorus",
    spatialDynamics: "open spatial character on payoff sections"
  },
  {
    tokens: ["urgent", "anxious", "restless", "tense", "frantic"],
    percussionBehavior: "tighter rhythmic grid with anticipatory fills",
    harmonicMotion: "rising tension without early release",
    spatialDynamics: "compressed verse space"
  },
  {
    tokens: ["bitter", "angry", "defiant", "hostile", "furious"],
    harmonicMotion: "dissonant color and unresolved intervals",
    registerTexture: "edged mid-register delivery",
    percussionBehavior: "harder articulation on downbeats"
  },
  {
    tokens: ["sad", "melancholy", "melancholic", "heartbroken", "lonely", "wistful"],
    tonalTendency: "minor color with slower harmonic rhythm",
    percussionBehavior: "sparse, soft-attack percussion",
    registerTexture: "lower, closer vocal grain"
  },
  {
    tokens: ["nostalgic", "bittersweet", "reflective", "wistful"],
    tonalTendency: "mixed major/minor color",
    harmonicMotion: "gentle suspensions and delayed resolutions",
    spatialDynamics: "warm, slightly receded space"
  },
  {
    tokens: ["playful", "flirty", "cheeky", "lighthearted"],
    percussionBehavior: "syncopated, lighter percussion",
    harmonicMotion: "short, bouncing harmonic phrases",
    spatialDynamics: "bright, close-to-mid space"
  },
  {
    tokens: ["cinematic", "dramatic", "sweeping"],
    harmonicMotion: "widening harmonic span across the form",
    spatialDynamics: "gradual stage expansion",
    percussionBehavior: "held-back pulse until the lift"
  },
  {
    tokens: ["cold", "detached", "numb", "distant"],
    tonalTendency: "cool, static harmonic beds",
    registerTexture: "drier, more distant vocal",
    spatialDynamics: "recessed, less intimate space"
  }
];

function tokenizeIntent(intent: string): string[] {
  return intent
    .toLowerCase()
    .split(/[^a-z0-9+]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function uniquePhrases(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(value);
  }
  return phrases;
}

export function translateEmotionalIntent(intent: string): EmotionalSonicExpression {
  const trimmed = intent.trim();
  const tokens = new Set(tokenizeIntent(trimmed));
  const matched = INTENT_CUES.filter((cue) => cue.tokens.some((token) => tokens.has(token)));

  const tonalTendency = uniquePhrases(matched.map((cue) => cue.tonalTendency))[0];
  const percussionBehavior = uniquePhrases(matched.map((cue) => cue.percussionBehavior))[0];
  const registerTexture = uniquePhrases(matched.map((cue) => cue.registerTexture))[0];
  const harmonicMotion = uniquePhrases(matched.map((cue) => cue.harmonicMotion))[0];
  const spatialDynamics = uniquePhrases(matched.map((cue) => cue.spatialDynamics))[0];

  const summaryParts = uniquePhrases(
    matched.flatMap((cue) => [
      cue.tonalTendency,
      cue.percussionBehavior,
      cue.registerTexture,
      cue.harmonicMotion,
      cue.spatialDynamics
    ])
  );

  const summary =
    summaryParts.length > 0
      ? summaryParts.join("; ")
      : "realize the stated feeling through harmonic color, percussion density, vocal register, and spatial contrast across the form";

  return {
    ...(tonalTendency ? { tonalTendency } : {}),
    ...(percussionBehavior ? { percussionBehavior } : {}),
    ...(registerTexture ? { registerTexture } : {}),
    ...(harmonicMotion ? { harmonicMotion } : {}),
    ...(spatialDynamics ? { spatialDynamics } : {}),
    summary
  };
}

export function isAdjectiveOnlyEmotion(intent: string, expression: EmotionalSonicExpression): boolean {
  const normalizedIntent = intent
    .toLowerCase()
    .replace(/[^a-z0-9\s,]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedSummary = expression.summary.toLowerCase().replace(/\s+/g, " ").trim();
  return normalizedSummary === normalizedIntent;
}
