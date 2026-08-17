import { classifySectionRole, parseStructureSections } from "@/lib/song-architect/arrangement-dna";
import {
  countWords,
  flattenLyricLines,
  foldLyricText,
  hasFoldedWordBoundary,
  includesFoldedPhrase,
  isBilingualLanguage,
  languageFamily,
  lyricBodyText,
  tokenizeLyricLine
} from "@/lib/song-architect/lyrics-text";
import { detectGenericEdmDropLyricLeak } from "@/lib/song-architect/sonic-exclusions";
import { getSongLengthBlueprint } from "@/lib/song-architect/song-length";
import type {
  ArrangementSectionRole,
  SongArchitectCandidate,
  SongArchitectLyricsSection,
  SongArchitectResolvedInput,
  SongCandidateCritique,
  SongCandidateCritiqueDimensions,
  SongDNA
} from "@/lib/song-architect/types";

const AI_CLICHE_TOKENS = [
  "shadows",
  "echoes",
  "echo",
  "fire",
  "flames",
  "scars",
  "scar",
  "broken",
  "rise",
  "ashes",
  "silence",
  "screaming",
  "drowning",
  "pieces",
  "fade",
  "fading",
  "darkness",
  "light",
  "destiny",
  "forever",
  "shatter",
  "shattered",
  "phoenix",
  "battle",
  "war inside",
  "find my way",
  "in the night"
];

const GENERIC_ABSTRACTIONS = [
  "i feel the pain",
  "feel the pain",
  "in my heart",
  "in the darkness",
  "find my way",
  "through the night",
  "never give up",
  "i will rise",
  "we will rise",
  "hold on tight",
  "lost in the moment",
  "broken inside",
  "heart of gold"
];

const SPANISH_MARKERS = new Set([
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
  "aqui",
  "alli",
  "noche",
  "amor",
  "corazon",
  "vida",
  "quiero",
  "porque"
]);

const ENGLISH_MARKERS = new Set([
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
  "because",
  "never",
  "always",
  "still",
  "gonna",
  "wanna"
]);

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function sectionRole(section: SongArchitectLyricsSection): ArrangementSectionRole {
  return classifySectionRole(section.section);
}

function sectionsByRole(
  sections: SongArchitectLyricsSection[],
  roles: ArrangementSectionRole[]
): SongArchitectLyricsSection[] {
  return sections.filter((section) => roles.includes(sectionRole(section)));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function estimateSyllables(line: string, language: string): number {
  const tokens = tokenizeLyricLine(line);
  if (tokens.length === 0) return 0;
  const family = languageFamily(language);
  return tokens.reduce((sum, token) => sum + estimateTokenSyllables(token, family), 0);
}

function estimateTokenSyllables(token: string, family: ReturnType<typeof languageFamily>): number {
  const word = foldLyricText(token);
  if (!word) return 0;
  if (family === "spanish") {
    const collapsed = word.replace(/[aeiou][aeiou]/g, "a");
    const groups = collapsed.match(/[aeiouáéíóúü]+/g);
    return Math.max(1, groups?.length ?? 1);
  }
  const cleaned = word.replace(/e$/i, word.length > 3 ? "" : "e");
  const groups = cleaned.match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

export function collectHardConstraintViolations(
  candidate: SongArchitectCandidate,
  songDNA: SongDNA,
  resolvedInput?: SongArchitectResolvedInput
): string[] {
  const violations: string[] = [];
  const body = lyricBodyText(candidate.lyricsSections);
  const language = songDNA.composition.language;
  const avoidWords = songDNA.composition.avoidWords;
  const mustInclude = songDNA.composition.mustInclude;

  for (const word of avoidWords) {
    if (hasFoldedWordBoundary(body, word) || (word.includes(" ") && includesFoldedPhrase(body, word))) {
      violations.push(`Avoid Words violation: "${word}"`);
    }
  }

  for (const phrase of mustInclude) {
    if (!includesFoldedPhrase(body, phrase) && !hasFoldedWordBoundary(body, phrase)) {
      violations.push(`Must Include missing: "${phrase}"`);
    }
  }

  const required = parseStructureSections(songDNA.composition.structure);
  const presentRoles = new Set(candidate.lyricsSections.map((section) => sectionRole(section)));
  const requiredRoles = new Set(required.map((section) => section.role).filter((role) => role !== "other"));
  for (const role of requiredRoles) {
    if (!presentRoles.has(role)) {
      violations.push(`Missing required section: ${role}`);
    }
  }

  const empty = candidate.lyricsSections.filter((section) => section.lines.length === 0);
  for (const section of empty) {
    violations.push(`Empty section: ${section.section}`);
  }

  if (!isBilingualLanguage(language)) {
    const family = languageFamily(language);
    if (family === "english" || family === "spanish") {
      const tokens = flattenLyricLines(candidate.lyricsSections).flatMap((line) =>
        tokenizeLyricLine(line).map((token) => foldLyricText(token))
      );
      const content = tokens.filter((token) => token.length > 1);
      if (content.length >= 12) {
        const spanishHits = content.filter((token) => SPANISH_MARKERS.has(token)).length;
        const englishHits = content.filter((token) => ENGLISH_MARKERS.has(token)).length;
        const spanishRatio = spanishHits / content.length;
        const englishRatio = englishHits / content.length;
        if (family === "english" && spanishRatio >= 0.18 && spanishRatio > englishRatio * 1.4) {
          violations.push("Language mismatch: lyrics read as Spanish while Song DNA is English");
        }
        if (family === "spanish" && englishRatio >= 0.18 && englishRatio > spanishRatio * 1.4) {
          violations.push("Language mismatch: lyrics read as English while Song DNA is Spanish");
        }
      }
    }
  }

  const hook = songDNA.composition.hookIdentity.trim();
  if (hook && !includesFoldedPhrase(body, hook) && !includesFoldedPhrase(candidate.concept.hookIdentity, hook)) {
    const hookTokens = tokenizeLyricLine(hook).map((token) => foldLyricText(token)).filter((token) => token.length > 2);
    const bodyFolded = foldLyricText(body);
    const missingCore = hookTokens.filter((token) => !bodyFolded.includes(token)).length;
    if (hookTokens.length > 0 && missingCore / hookTokens.length >= 0.6) {
      violations.push("Hook identity is not present in the lyrics");
    }
  }

  if (resolvedInput) {
    const blueprint = getSongLengthBlueprint(resolvedInput.songLength);
    const words = countWords(body);
    if (words > 0 && words < Math.max(8, Math.round(blueprint.totalLyricWordCountMin * 0.25))) {
      violations.push("Lyrics are far below the requested runtime length");
    }
  }

  const dropLeak = detectGenericEdmDropLyricLeak(body, songDNA, resolvedInput);
  if (dropLeak) {
    violations.push(`Sonic exclusion leak: lyrics reuse excluded EDM-drop language ("${dropLeak}")`);
  }

  return violations;
}

export function analyzeHookQuality(
  candidate: SongArchitectCandidate,
  songDNA: SongDNA
): { strength: number; clarity: number; notes: string[] } {
  const notes: string[] = [];
  const hook = songDNA.composition.hookIdentity.trim();
  const chorus = sectionsByRole(candidate.lyricsSections, ["chorus", "final-chorus", "hook", "drop"]);
  const verses = sectionsByRole(candidate.lyricsSections, ["verse"]);
  const chorusLines = flattenLyricLines(chorus);
  const verseLines = flattenLyricLines(verses);
  const chorusText = chorusLines.join("\n");
  const present = hook ? includesFoldedPhrase(chorusText, hook) || includesFoldedPhrase(lyricBodyText(candidate.lyricsSections), hook) : false;

  let strength = present ? 78 : 42;
  let clarity = present ? 76 : 40;

  const hookWords = hook ? tokenizeLyricLine(hook).length : 0;
  if (hookWords > 0 && hookWords <= 8) {
    strength += 8;
    clarity += 10;
    notes.push("concise hook identity");
  } else if (hookWords > 14) {
    strength -= 18;
    clarity -= 16;
    notes.push("verbose hook identity");
  }

  const repeatedHookLines = chorusLines.filter((line) => hook && includesFoldedPhrase(line, hook));
  if (repeatedHookLines.length >= 1 && repeatedHookLines.length <= 4) {
    strength += 6;
    notes.push("useful hook repetition");
  } else if (repeatedHookLines.length >= 6) {
    strength -= 8;
    notes.push("excessive hook repetition");
  }

  if (chorusLines.length > 0 && verseLines.length > 0) {
    const chorusFolded = new Set(chorusLines.map((line) => foldLyricText(line)));
    const overlap = verseLines.filter((line) => chorusFolded.has(foldLyricText(line))).length;
    if (overlap === 0) {
      strength += 6;
      notes.push("chorus differs from verse writing");
    } else if (overlap >= Math.max(2, Math.floor(chorusLines.length / 2))) {
      strength -= 12;
      notes.push("chorus restates verse language");
    }
  }

  const longChorus = chorusLines.filter((line) => tokenizeLyricLine(line).length > 12).length;
  if (longChorus > 0) {
    strength -= 8;
    clarity -= 10;
    notes.push("chorus lines are too long to sing cleanly");
  }

  if (!present) notes.push("intended hook is weak or missing");
  return { strength: clampScore(strength), clarity: clampScore(clarity), notes };
}

export function analyzeSingability(
  candidate: SongArchitectCandidate,
  language: string
): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 78;
  const family = languageFamily(language);

  for (const section of candidate.lyricsSections) {
    if (section.lines.length < 2) continue;
    const syllables = section.lines.map((line) => estimateSyllables(line, language));
    const mid = median(syllables);
    const spread = stddev(syllables);
    const outliers = section.lines.filter((_, index) => mid > 0 && Math.abs(syllables[index] - mid) >= Math.max(5, mid * 0.85));
    if (spread > 3.2) {
      score -= family === "other" ? 4 : 8;
      notes.push(`${section.section} meter is uneven`);
    }
    if (outliers.length > 0) {
      score -= 5;
      notes.push(`${section.section} has extreme line-length outliers`);
    }
    const wordCounts = section.lines.map((line) => tokenizeLyricLine(line).length);
    if (wordCounts.every((count) => count === wordCounts[0]) && wordCounts[0] >= 6 && section.lines.length >= 4) {
      score -= 4;
      notes.push(`${section.section} uses identical line lengths`);
    }
  }

  const denseClusters = flattenLyricLines(candidate.lyricsSections).filter((line) =>
    /[bcdfghjklmnpqrstvwxz]{5,}/i.test(foldLyricText(line))
  );
  if (denseClusters.length > 0) {
    score -= 6;
    notes.push("stress-unfriendly consonant clusters");
  }

  return { score: clampScore(score), notes };
}

export function analyzeAiWritingPatterns(
  candidate: SongArchitectCandidate,
  songDNA: SongDNA
): { risk: number; clicheRisk: number; notes: string[] } {
  const notes: string[] = [];
  const lines = flattenLyricLines(candidate.lyricsSections);
  const body = foldLyricText(lines.join("\n"));
  const hookFolded = foldLyricText(songDNA.composition.hookIdentity);
  const themeFolded = foldLyricText(songDNA.composition.theme);

  let clicheHits = 0;
  for (const token of AI_CLICHE_TOKENS) {
    if (hookFolded.includes(token) || themeFolded.includes(token)) continue;
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${token}(?:$|[^\\p{L}\\p{N}])`, "gu");
    const matches = body.match(pattern);
    clicheHits += matches?.length ?? 0;
  }

  let abstractionHits = 0;
  for (const phrase of GENERIC_ABSTRACTIONS) {
    if (body.includes(phrase)) abstractionHits += 1;
  }

  const openings = lines.map((line) => foldLyricText(tokenizeLyricLine(line).slice(0, 2).join(" "))).filter(Boolean);
  const openingCounts = new Map<string, number>();
  for (const opening of openings) {
    openingCounts.set(opening, (openingCounts.get(opening) ?? 0) + 1);
  }
  const repeatedOpenings = [...openingCounts.values()].filter((count) => count >= 3).length;

  const exactCounts = new Map<string, number>();
  for (const line of lines) {
    const key = foldLyricText(line);
    exactCounts.set(key, (exactCounts.get(key) ?? 0) + 1);
  }
  const duplicateLines = [...exactCounts.values()].filter((count) => count >= 3).length;

  const bridges = sectionsByRole(candidate.lyricsSections, ["bridge"]);
  const choruses = sectionsByRole(candidate.lyricsSections, ["chorus", "final-chorus", "hook"]);
  const chorusSet = new Set(flattenLyricLines(choruses).map((line) => foldLyricText(line)));
  const bridgeRestates =
    bridges.length > 0 &&
    flattenLyricLines(bridges).filter((line) => chorusSet.has(foldLyricText(line))).length >= 2;

  const inspirationalClose = /we (?:will )?rise|find (?:the )?light|never give up|together we/i.test(lines.slice(-3).join(" "));

  let risk = 18 + clicheHits * 8 + abstractionHits * 10 + repeatedOpenings * 6 + duplicateLines * 5;
  let clicheRisk = 16 + clicheHits * 10 + abstractionHits * 8;
  if (bridgeRestates) {
    risk += 12;
    notes.push("bridge restates the chorus");
  }
  if (inspirationalClose && !/hope|uplift|anthem|rise/i.test(songDNA.composition.emotionalIntent)) {
    risk += 8;
    notes.push("generic inspirational resolution");
  }
  if (clicheHits >= 4) notes.push("high generic-cliché density");
  if (abstractionHits >= 2) notes.push("generic emotional abstraction");
  if (repeatedOpenings > 0) notes.push("repetitive sentence construction");

  return { risk: clampScore(risk), clicheRisk: clampScore(clicheRisk), notes };
}

function analyzeSongDNAAdherence(candidate: SongArchitectCandidate, songDNA: SongDNA): number {
  let score = 82;
  const body = lyricBodyText(candidate.lyricsSections);
  if (!includesFoldedPhrase(candidate.concept.theme, songDNA.composition.theme) && !includesFoldedPhrase(body, songDNA.composition.theme.split(" ")[0] ?? "")) {
    score -= 8;
  }
  if (!includesFoldedPhrase(candidate.concept.hookIdentity, songDNA.composition.hookIdentity)) {
    score -= 10;
  }
  if (foldLyricText(candidate.concept.emotion) !== foldLyricText(songDNA.composition.emotionalIntent)) {
    score -= 6;
  }
  if (languageFamily(candidate.concept.theme) === "other") {
    score -= 0;
  }
  const required = parseStructureSections(songDNA.composition.structure);
  const present = new Set(candidate.lyricsSections.map((section) => sectionRole(section)));
  const missing = required.filter((section) => section.role !== "other" && !present.has(section.role)).length;
  score -= missing * 12;
  return clampScore(score);
}

function analyzeEmotionalPayoff(candidate: SongArchitectCandidate, songDNA: SongDNA): number {
  const chorus = flattenLyricLines(sectionsByRole(candidate.lyricsSections, ["chorus", "final-chorus", "hook", "drop"]));
  const verses = flattenLyricLines(sectionsByRole(candidate.lyricsSections, ["verse"]));
  let score = 70;
  if (chorus.length > 0 && verses.length > 0) {
    const chorusWords = chorus.join(" ").length;
    const verseWords = verses.join(" ").length / Math.max(1, verses.length);
    if (chorusWords / Math.max(1, chorus.length) < verseWords) score += 8;
  }
  if (includesFoldedPhrase(lyricBodyText(candidate.lyricsSections), songDNA.composition.hookIdentity)) score += 8;
  const concrete = flattenLyricLines(candidate.lyricsSections).filter((line) =>
    /\b(train|street|phone|kitchen|rain|window|car|name|photo|jacket|river|room|door|city|night shift)\b/i.test(line)
  ).length;
  score += Math.min(10, concrete * 2);
  return clampScore(score);
}

function analyzeStructuralCoherence(candidate: SongArchitectCandidate, songDNA: SongDNA): number {
  const required = parseStructureSections(songDNA.composition.structure);
  const present = candidate.lyricsSections.map((section) => sectionRole(section));
  let score = 80;
  const missing = required.filter((section) => section.role !== "other" && !present.includes(section.role)).length;
  score -= missing * 16;
  const payoff = present.some((role) => role === "chorus" || role === "final-chorus" || role === "drop" || role === "hook");
  if (!payoff) score -= 20;
  const verseCount = present.filter((role) => role === "verse").length;
  if (required.some((section) => section.role === "verse") && verseCount === 0) score -= 16;
  return clampScore(score);
}

function analyzeRepetitionBalance(candidate: SongArchitectCandidate): number {
  const lines = flattenLyricLines(candidate.lyricsSections);
  if (lines.length === 0) return 40;
  const unique = new Set(lines.map((line) => foldLyricText(line)));
  const ratio = unique.size / lines.length;
  if (ratio > 0.92) return 68;
  if (ratio > 0.7) return 82;
  if (ratio > 0.5) return 70;
  return 48;
}

function analyzeImagery(candidate: SongArchitectCandidate): number {
  const lines = flattenLyricLines(candidate.lyricsSections);
  if (lines.length === 0) return 40;
  const specific = lines.filter((line) =>
    /\b(\d{2,4}|[A-Z][a-z]{3,}|street|kitchen|train|window|river|jacket|photo|midnight|neon|harbor|barrio)\b/.test(line)
  ).length;
  return clampScore(55 + Math.min(30, specific * 4));
}

function analyzeGenreFit(candidate: SongArchitectCandidate, songDNA: SongDNA): number {
  const family = songDNA.meta.genreFamily;
  const lines = flattenLyricLines(candidate.lyricsSections);
  const avgWords = lines.length === 0 ? 0 : lines.reduce((sum, line) => sum + tokenizeLyricLine(line).length, 0) / lines.length;
  let score = 74;
  if (family === "edm" && avgWords > 11) score -= 8;
  if (family === "hip-hop" && avgWords < 5) score -= 6;
  if (family === "ballad" && avgWords > 14) score -= 6;
  return clampScore(score);
}

function uniqueNotes(notes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const note of notes) {
    const key = foldLyricText(note);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(note);
  }
  return out;
}

export function critiqueSongCandidate(
  candidate: SongArchitectCandidate,
  songDNA: SongDNA,
  resolvedInput?: SongArchitectResolvedInput
): SongCandidateCritique {
  const hardConstraintViolations = collectHardConstraintViolations(candidate, songDNA, resolvedInput);
  const hook = analyzeHookQuality(candidate, songDNA);
  const singability = analyzeSingability(candidate, songDNA.composition.language);
  const patterns = analyzeAiWritingPatterns(candidate, songDNA);
  const songDNAAdherence = analyzeSongDNAAdherence(candidate, songDNA);
  const emotionalPayoff = analyzeEmotionalPayoff(candidate, songDNA);
  const structuralCoherence = analyzeStructuralCoherence(candidate, songDNA);
  const repetitionBalance = analyzeRepetitionBalance(candidate);
  const imagerySpecificity = analyzeImagery(candidate);
  const genreFit = analyzeGenreFit(candidate, songDNA);
  const lyricalClarity = clampScore(100 - Math.min(40, flattenLyricLines(candidate.lyricsSections).filter((line) => tokenizeLyricLine(line).length > 14).length * 8));

  const dimensions: SongCandidateCritiqueDimensions = {
    hookStrength: hook.strength,
    hookClarity: hook.clarity,
    singability: singability.score,
    lyricalClarity,
    emotionalPayoff,
    originality: clampScore(100 - patterns.risk * 0.65),
    structuralCoherence,
    genreFit,
    repetitionBalance,
    imagerySpecificity,
    clicheRisk: patterns.clicheRisk,
    aiWritingRisk: patterns.risk,
    songDNAAdherence
  };

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if ((dimensions.hookStrength ?? 0) >= 75) strengths.push("stronger hook");
  if ((dimensions.singability ?? 0) >= 78) strengths.push("cleaner flow");
  if ((dimensions.structuralCoherence ?? 0) >= 80) strengths.push("better section contrast");
  if ((dimensions.imagerySpecificity ?? 0) >= 72) strengths.push("more specific imagery");
  if ((dimensions.aiWritingRisk ?? 100) <= 28) strengths.push("lower AI-writing-pattern risk");
  if (hardConstraintViolations.length === 0) strengths.push("meets hard constraints");

  weaknesses.push(...hardConstraintViolations);
  weaknesses.push(...hook.notes.filter((note) => /missing|verbose|excessive|restates|too long|weak/.test(note)));
  weaknesses.push(...singability.notes);
  weaknesses.push(...patterns.notes);

  const overallScore = scoreCritique(dimensions, hardConstraintViolations.length);

  return {
    candidateId: candidate.id,
    dimensions,
    hardConstraintViolations,
    strengths: uniqueNotes(strengths),
    weaknesses: uniqueNotes(weaknesses),
    overallScore
  };
}

/**
 * Internal ranking signal only. Not a scientific quality claim.
 * Weights are applied in candidate-selection; this overall score uses the same weights.
 */
export function scoreCritique(dimensions: SongCandidateCritiqueDimensions, hardViolationCount: number): number {
  const hardConstraintCompliance = clampScore(100 - hardViolationCount * 35);
  const hookQuality = ((dimensions.hookStrength ?? 50) + (dimensions.hookClarity ?? 50)) / 2;
  const originality = clampScore(100 - ((dimensions.clicheRisk ?? 0) + (dimensions.aiWritingRisk ?? 0)) / 2);

  const weighted =
    hardConstraintCompliance * 0.4 +
    (dimensions.songDNAAdherence ?? 50) * 0.18 +
    hookQuality * 0.16 +
    (dimensions.singability ?? 50) * 0.1 +
    (dimensions.emotionalPayoff ?? 50) * 0.08 +
    (dimensions.structuralCoherence ?? 50) * 0.05 +
    originality * 0.03;
  const severePatternPenalty =
    (dimensions.aiWritingRisk ?? 0) >= 50 ? 10 : (dimensions.clicheRisk ?? 0) >= 50 ? 6 : 0;

  return clampScore(weighted - severePatternPenalty);
}
