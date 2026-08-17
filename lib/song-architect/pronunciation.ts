import { foldLyricText, languageFamily, tokenizeLyricLine } from "@/lib/song-architect/lyrics-text";
import type {
  PronunciationAdjustment,
  PronunciationAnalysis,
  PronunciationOverride,
  SongArchitectLyricsSection,
  SongDNA
} from "@/lib/song-architect/types";

const COMMON_ENGLISH = new Set([
  "the",
  "and",
  "you",
  "your",
  "that",
  "this",
  "with",
  "from",
  "have",
  "just",
  "when",
  "what",
  "where",
  "who",
  "why",
  "how",
  "because",
  "never",
  "always",
  "still",
  "love",
  "heart",
  "night",
  "light",
  "time",
  "want",
  "need",
  "know",
  "feel",
  "come",
  "back",
  "down",
  "over",
  "under",
  "through",
  "again",
  "baby",
  "girl",
  "boy",
  "man",
  "world",
  "life",
  "eyes",
  "hands",
  "home",
  "fire",
  "rain",
  "city",
  "street",
  "room",
  "door",
  "window",
  "run",
  "stop",
  "no",
  "yes",
  "broken",
  "profits",
  "say",
  "can",
  "did",
  "got"
]);

const COMMON_SPANISH = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "que",
  "de",
  "y",
  "en",
  "con",
  "por",
  "para",
  "como",
  "mas",
  "pero",
  "mi",
  "tu",
  "su",
  "yo",
  "no",
  "si",
  "esta",
  "este",
  "eso",
  "amor",
  "vida",
  "noche",
  "corazon",
  "corazón",
  "quiero",
  "porque",
  "siempre",
  "nunca",
  "aqui",
  "alli",
  "fuego",
  "lluvia",
  "calle",
  "casa",
  "cielo",
  "alma",
  "beso",
  "mano",
  "ojos",
  "tiempo",
  "solo",
  "sola",
  "vamos",
  "ahora"
]);

const KNOWN_PRONUNCIATIONS: Record<string, { pronunciation: string; reason: string }> = {
  areyto: { pronunciation: "Ah-RAY-toh", reason: "Taíno/Puerto Rican ceremonial term often misread" },
  coqui: { pronunciation: "ko-KEE", reason: "Puerto Rican tree frog name" },
  "coquí": { pronunciation: "ko-KEE", reason: "Puerto Rican tree frog name" },
  guanin: { pronunciation: "gwah-NEEN", reason: "Taíno gold pendant name" },
  "guanín": { pronunciation: "gwah-NEEN", reason: "Taíno gold pendant name" },
  bohio: { pronunciation: "bo-EE-oh", reason: "Caribbean dwelling name" },
  "bohío": { pronunciation: "bo-EE-oh", reason: "Caribbean dwelling name" },
  yunque: { pronunciation: "YOON-keh", reason: "El Yunque place name" },
  loiza: { pronunciation: "lo-EE-sah", reason: "Puerto Rican place name" },
  "loíza": { pronunciation: "lo-EE-sah", reason: "Puerto Rican place name" },
  mayaguez: { pronunciation: "my-ah-GWES", reason: "Puerto Rican place name" },
  "mayagüez": { pronunciation: "my-ah-GWES", reason: "Puerto Rican place name" },
  caguas: { pronunciation: "KAH-gwas", reason: "Puerto Rican place name" },
  arecibo: { pronunciation: "ah-reh-SEE-bo", reason: "Puerto Rican place name" },
  jayuya: { pronunciation: "ha-YOO-yah", reason: "Puerto Rican place name" },
  utuado: { pronunciation: "oo-TWAH-do", reason: "Puerto Rican place name" },
  guaynabo: { pronunciation: "gwy-NAH-bo", reason: "Puerto Rican place name" },
  bayamon: { pronunciation: "by-ah-MON", reason: "Puerto Rican place name" },
  "bayamón": { pronunciation: "by-ah-MON", reason: "Puerto Rican place name" },
  culebra: { pronunciation: "koo-LEH-brah", reason: "Puerto Rican island name" },
  vieques: { pronunciation: "vee-EH-kes", reason: "Puerto Rican island name" },
  sanjuan: { pronunciation: "sahn-HWAN", reason: "Puerto Rican capital" },
  "san juan": { pronunciation: "sahn-HWAN", reason: "Puerto Rican capital" }
};

/** Known initialisms with strong evidence for letter-splitting. ALL CAPS alone is not enough. */
const KNOWN_INITIALISMS = new Set([
  "ai",
  "dj",
  "fbi",
  "cia",
  "usa",
  "nyc",
  "edm",
  "nasa",
  "tv",
  "ok",
  "bpm",
  "dna",
  "gps",
  "usb",
  "cdn",
  "api",
  "vpn",
  "http",
  "https",
  "pdf",
  "html",
  "css",
  "sql",
  "nft",
  "diy"
]);

const ALL_CAPS_TOKEN = /^[A-Z]{2,5}$/;
const ABBREVIATION = /^(?:mr|mrs|ms|dr|st|ave|blvd|vs|etc)\.?$/i;
const UNUSUAL_SPELLING = /[A-Z][a-z]*[A-Z]|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\-]/;

function isCommonVocabulary(token: string, family: ReturnType<typeof languageFamily>): boolean {
  const folded = foldLyricText(token);
  if (COMMON_ENGLISH.has(folded) || COMMON_SPANISH.has(folded)) return true;
  if (family === "spanish" && COMMON_SPANISH.has(folded)) return true;
  if (family === "english" && COMMON_ENGLISH.has(folded)) return true;
  return false;
}

/**
 * Letter-split only when there is strong evidence the token is an initialism.
 * Ordinary ALL-CAPS emphasis (WHO, LOVE, STOP) must stay unchanged.
 * If uncertain, leave the original word unchanged.
 */
function isLikelyInitialism(token: string): boolean {
  if (!ALL_CAPS_TOKEN.test(token)) return false;
  const folded = foldLyricText(token);
  if (COMMON_ENGLISH.has(folded) || COMMON_SPANISH.has(folded)) return false;
  return KNOWN_INITIALISMS.has(folded);
}

function looksLikeProperName(token: string, indexInLine: number): boolean {
  if (indexInLine === 0) return false;
  return /^[A-ZÁÉÍÓÚÜÑ][a-zàáéíóúüñ']{2,}$/.test(token);
}

function looksSpanish(token: string): boolean {
  return /[áéíóúüñ¿¡]/i.test(token) || COMMON_SPANISH.has(foldLyricText(token));
}

function looksEnglish(token: string): boolean {
  return COMMON_ENGLISH.has(foldLyricText(token));
}

function phoneticizeUnknown(token: string, family: ReturnType<typeof languageFamily>): string | undefined {
  const folded = foldLyricText(token);
  const known = KNOWN_PRONUNCIATIONS[folded];
  if (known) return known.pronunciation;
  if (isLikelyInitialism(token)) return token.split("").join("-");
  if (family === "english" && looksSpanish(token) && token.length > 3) {
    return undefined;
  }
  return undefined;
}

export function detectPronunciationTargets(
  sections: SongArchitectLyricsSection[],
  songDNA: SongDNA,
  overrides: PronunciationOverride[] = []
): PronunciationAdjustment[] {
  const family = languageFamily(songDNA.composition.language);
  const overrideMap = new Map(
    overrides.map((entry) => [foldLyricText(entry.word), entry] as const)
  );
  const seen = new Map<string, PronunciationAdjustment>();

  for (const section of sections) {
    for (const line of section.lines) {
      const tokens = tokenizeLyricLine(line);
      tokens.forEach((token, index) => {
        const folded = foldLyricText(token);
        if (!folded || seen.has(folded)) return;

        const override = overrideMap.get(folded);
        if (override) {
          seen.set(folded, {
            word: token,
            pronunciation: override.pronunciation,
            reason: override.reason ?? "user pronunciation override",
            source: "override"
          });
          return;
        }

        if (isCommonVocabulary(token, family)) return;
        if (ABBREVIATION.test(token) && token.length <= 4) {
          seen.set(folded, {
            word: token,
            pronunciation: token.replace(/\./g, "-"),
            reason: "abbreviation",
            source: "auto"
          });
          return;
        }

        const known = KNOWN_PRONUNCIATIONS[folded];
        if (known) {
          if (family === "spanish" && looksSpanish(token) && !/[A-Z]/.test(token.slice(1))) {
            // Keep everyday Spanish natural unless the token is a known risky proper/place name.
            if (!/areyto|coqui|guanin|bohio|yunque|loiza|mayaguez|caguas|arecibo|jayuya|utuado|guaynabo|bayamon|culebra|vieques|sanjuan/.test(folded)) {
              return;
            }
          }
          seen.set(folded, {
            word: token,
            pronunciation: known.pronunciation,
            reason: known.reason,
            source: "auto"
          });
          return;
        }

        if (isLikelyInitialism(token)) {
          seen.set(folded, {
            word: token,
            pronunciation: token.split("").join("-"),
            reason: "acronym",
            source: "auto"
          });
          return;
        }

        if (family === "english" && looksSpanish(token) && !COMMON_SPANISH.has(folded) && token.length > 3) {
          const pronunciation = phoneticizeUnknown(token, family);
          if (pronunciation) {
            seen.set(folded, {
              word: token,
              pronunciation,
              reason: "Spanish token inside English lyrics",
              source: "auto"
            });
          }
          return;
        }

        if (family === "spanish" && looksEnglish(token) && !COMMON_SPANISH.has(folded) && /^[A-Z]/.test(token) && index > 0) {
          return;
        }

        if (looksLikeProperName(token, index) || UNUSUAL_SPELLING.test(token)) {
          const pronunciation = phoneticizeUnknown(token, family);
          if (pronunciation) {
            seen.set(folded, {
              word: token,
              pronunciation,
              reason: looksLikeProperName(token, index) ? "proper or uncommon name" : "unusual spelling",
              source: "auto"
            });
          }
        }
      });
    }
  }

  for (const override of overrides) {
    const folded = foldLyricText(override.word);
    if (!seen.has(folded)) {
      seen.set(folded, {
        word: override.word,
        pronunciation: override.pronunciation,
        reason: override.reason ?? "user pronunciation override",
        source: "override"
      });
    }
  }

  return [...seen.values()];
}

function applyAdjustmentsToLine(line: string, adjustments: PronunciationAdjustment[]): string {
  let next = line;
  const sorted = [...adjustments].sort((left, right) => right.word.length - left.word.length);
  for (const adjustment of sorted) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${adjustment.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu");
    next = next.replace(pattern, adjustment.pronunciation);
  }
  return next;
}

export function applyPronunciationAdjustments(
  cleanLyrics: string,
  adjustments: PronunciationAdjustment[]
): string {
  if (adjustments.length === 0) return cleanLyrics;
  return cleanLyrics
    .split("\n")
    .map((line) => {
      if (line.startsWith("[") && line.endsWith("]")) return line;
      return applyAdjustmentsToLine(line, adjustments);
    })
    .join("\n");
}

export function analyzePronunciation(args: {
  cleanLyrics: string;
  sections: SongArchitectLyricsSection[];
  songDNA: SongDNA;
  overrides?: PronunciationOverride[];
}): PronunciationAnalysis {
  const adjustments = detectPronunciationTargets(args.sections, args.songDNA, args.overrides ?? []);
  const generationOptimizedLyrics =
    adjustments.length === 0 ? args.cleanLyrics : applyPronunciationAdjustments(args.cleanLyrics, adjustments);
  return {
    adjustments,
    cleanLyrics: args.cleanLyrics,
    generationOptimizedLyrics
  };
}

/** Keep the highest-risk unique annotations. Does not add parenthetical noise. */
export function budgetPronunciationAdjustments(
  adjustments: PronunciationAdjustment[],
  maxAnnotations: number
): PronunciationAdjustment[] {
  if (adjustments.length <= maxAnnotations) return adjustments;
  const ranked = [...adjustments].sort((left, right) => {
    const sourceDelta = (right.source === "override" ? 2 : 0) - (left.source === "override" ? 2 : 0);
    if (sourceDelta !== 0) return sourceDelta;
    const knownDelta = Number(Boolean(KNOWN_PRONUNCIATIONS[foldLyricText(right.word)])) - Number(Boolean(KNOWN_PRONUNCIATIONS[foldLyricText(left.word)]));
    if (knownDelta !== 0) return knownDelta;
    return right.word.length - left.word.length;
  });
  return ranked.slice(0, Math.max(0, maxAnnotations));
}
