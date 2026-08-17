/**
 * Generation Match Engine deterministic fixtures.
 *
 * Run:
 * node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/song-architect-generation-match-test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluateMasterReadiness } from "@/lib/audio/master-readiness";
import {
  evaluateGenerationMatch,
  normalizedTempoDifference
} from "@/lib/song-architect/generation-match";

const EVALUATED_AT = "2026-08-17T12:00:00.000Z";

function songDNA({
  bpm = 94,
  tone = "dark nocturnal production",
  bass = "",
  dynamics = "",
  vocalRegister = "",
  harmony,
  energies = [4, 8, 5, 9],
  spatial = ["narrow centered", "wide chorus", "narrow centered", "widest final chorus"]
} = {}) {
  const labels = ["Verse 1", "Chorus", "Verse 2", "Final Chorus"];
  const roles = ["verse", "chorus", "verse", "final-chorus"];
  return {
    composition: {
      theme: "fixture",
      angle: "fixture",
      emotionalIntent: "dark but hopeful",
      hookIdentity: "fixture hook",
      lyricalPerspective: "first person",
      language: "English",
      structure: labels.join(" > "),
      runtime: "~3 minutes",
      lineDensity: "balanced",
      vocalStyle: vocalRegister,
      mustInclude: [],
      avoidWords: [],
      energyCurve: energies.join(",")
    },
    sonic: {
      primaryGenre: "pop",
      bpm,
      productionAesthetic: tone,
      bassCharacter: bass,
      dynamics,
      vocalRegister
    },
    ...(harmony ? { harmony } : {}),
    arrangement: {
      globalArc: "restrained verses into high-energy choruses",
      sections: labels.map((label, index) => ({
        id: `section-${index}`,
        label,
        sectionType: roles[index],
        energy: energies[index],
        spatialDirection: spatial[index]
      }))
    },
    meta: {
      genreFamily: "pop",
      inferenceMode: "automatic",
      userOverrides: []
    }
  };
}

function dimensions(result) {
  return Object.fromEntries(result.dimensions.map((dimension) => [dimension.id, dimension]));
}

// CASE A — HIGH MATCH.
const high = evaluateGenerationMatch({
  songDNA: songDNA({
    bass: "full weight, deep bass",
    dynamics: "natural dynamics with open transient movement"
  }),
  analysis: {
    tempo: { bpm: 95, source: "provided_analysis" },
    v2: {
      crestFactorDb: 9.5,
      loudnessRangeLu: 7,
      spectralSlopeDbPerOct: -4.2,
      stereoWidthRatio: 0.62,
      activeFlags: ["low_end_excess"]
    },
    sectionEnergy: {
      values: [4.2, 8.1, 4.8, 9],
      confidence: "high",
      source: "provided_analysis"
    },
    sectionStereoWidth: {
      values: [0.08, 0.9, 0.12, 0.95],
      confidence: "high",
      source: "provided_analysis"
    }
  },
  evaluatedAt: EVALUATED_AT
});
assert.equal(high.overall, "high", "CASE A: close tempo, arc, dark tone, and width are HIGH");
assert.equal(dimensions(high).tempo.status, "matched");
assert.equal(dimensions(high).energy_arc.status, "matched");
assert.equal(dimensions(high).tonal_character.status, "matched");
assert.ok(high.correctionPlan.preserve.length > 0);
assert.equal(high.evaluatedAt, EVALUATED_AT);

// CASE B — MEDIUM MATCH: tempo/tone match, but chorus lift and width contrast do not.
const medium = evaluateGenerationMatch({
  songDNA: songDNA(),
  analysis: {
    tempo: { bpm: 94 },
    v2: { spectralSlopeDbPerOct: -3.8 },
    sectionEnergy: { values: [5, 5.5, 5.2, 5.8], confidence: "high" },
    sectionStereoWidth: { values: [0.35, 0.38, 0.36, 0.4], confidence: "high" }
  },
  evaluatedAt: EVALUATED_AT
});
assert.equal(medium.overall, "medium", "CASE B: matched tempo/tone plus flat energy/width is MEDIUM");
assert.equal(dimensions(medium).energy_arc.status, "missed");
assert.equal(dimensions(medium).section_stereo.status, "missed");
assert.ok(medium.correctionPlan.change.some((item) => /contrast|width/i.test(item)));

// CASE C — LOW MATCH.
const low = evaluateGenerationMatch({
  songDNA: songDNA(),
  analysis: {
    tempo: { bpm: 132 },
    v2: { spectralSlopeDbPerOct: -0.2 },
    sectionEnergy: { values: [8, 8, 8, 8], confidence: "high" },
    sectionStereoWidth: { values: [0.8, 0.8, 0.8, 0.8], confidence: "high" }
  },
  evaluatedAt: EVALUATED_AT
});
assert.equal(low.overall, "low", "CASE C: inconsistent tempo and flat arc are LOW");
assert.equal(dimensions(low).tempo.status, "missed");
assert.equal(dimensions(low).energy_arc.status, "missed");
assert.equal(dimensions(low).tonal_character.status, "missed");

// CASE D — NOT EVALUABLE: unavailable vocal/harmony traits carry zero weight.
const unavailableTraits = evaluateGenerationMatch({
  songDNA: songDNA({
    vocalRegister: "low baritone with aggressive rasp",
    harmony: {
      scaleOrMode: "F# minor",
      modeTendency: "minor",
      harmonicCharacter: "exact suspended chorus voicing"
    }
  }),
  analysis: {
    tempo: { bpm: 94 },
    v2: { spectralSlopeDbPerOct: -4 }
  },
  evaluatedAt: EVALUATED_AT
});
assert.equal(unavailableTraits.overall, "high", "CASE D: unavailable traits do not lower matched evidence");
assert.equal(dimensions(unavailableTraits).vocal_character.status, "not_evaluable");
assert.equal(dimensions(unavailableTraits).harmony.status, "not_evaluable");
assert.equal(unavailableTraits.evidenceCounts.notEvaluable >= 2, true);

// CASE E — HALF/DOUBLE-TIME normalization.
const halfTime = evaluateGenerationMatch({
  songDNA: songDNA({ bpm: 90, tone: "", energies: [] }),
  analysis: { tempo: { bpm: 180 } },
  evaluatedAt: EVALUATED_AT
});
assert.equal(halfTime.overall, "high");
assert.equal(dimensions(halfTime).tempo.status, "matched");
assert.equal(normalizedTempoDifference(90, 180).relationship, "double_time");
assert.equal(normalizedTempoDifference(180, 90).relationship, "half_time");

// CASE F — Master Readiness remains an independent result.
const poorReadiness = evaluateMasterReadiness({
  durationSec: 180,
  integratedLufs: -7,
  peakDb: 0,
  meanDb: -4,
  crestDb: 4,
  lowEndDb: -10,
  lowMidDb: -22,
  harshnessDb: -12,
  airDb: -14,
  alreadyLimited: true,
  notes: []
});
assert.equal(high.overall, "high");
assert.equal(poorReadiness.status, "Fix Mix First", "CASE F: HIGH match can coexist with poor readiness");
assert.equal("masterReadiness" in high, false, "Generation Match does not embed readiness semantics");

// CASE G — A&R data is neither accepted nor imported into calculation.
const highWithExternalArData = evaluateGenerationMatch({
  songDNA: songDNA({ tone: "", energies: [] }),
  analysis: { tempo: { bpm: 94 } },
  arScore: 1,
  evaluatedAt: EVALUATED_AT
});
const highWithoutExternalArData = evaluateGenerationMatch({
  songDNA: songDNA({ tone: "", energies: [] }),
  analysis: { tempo: { bpm: 94 } },
  evaluatedAt: EVALUATED_AT
});
assert.equal(highWithExternalArData.internalScore, highWithoutExternalArData.internalScore);
const engineSource = readFileSync("lib/song-architect/generation-match.ts", "utf8");
assert.doesNotMatch(engineSource, /@\/lib\/ar-ai|a&r score|hit potential/i, "CASE G: no A&R dependency");

// CASE H — PARTIAL MEASUREMENT: only evaluable tempo + global spectrum decide.
const partialEvidence = evaluateGenerationMatch({
  songDNA: songDNA({ vocalRegister: "airy female vocal" }),
  analysis: {
    tempo: { bpm: 95 },
    v2: { spectralSlopeDbPerOct: -4.1 }
  },
  evaluatedAt: EVALUATED_AT
});
assert.equal(partialEvidence.overall, "high");
assert.equal(partialEvidence.evidenceCounts.measured, 2);
assert.ok(partialEvidence.evidenceCounts.notEvaluable >= 2);

const noEvidence = evaluateGenerationMatch({
  songDNA: songDNA({ vocalRegister: "low baritone" }),
  analysis: {},
  evaluatedAt: EVALUATED_AT
});
assert.equal(noEvidence.overall, "not_evaluable", "missing capabilities do not become a LOW match");
assert.equal(noEvidence.internalScore, 0);

// V2 precedence: populated V2 spectrum wins over contradictory V1 bands.
const precedence = evaluateGenerationMatch({
  songDNA: songDNA({ energies: [] }),
  analysis: {
    tempo: { bpm: 94 },
    v2: { spectralSlopeDbPerOct: -4 },
    v1: { harshnessDb: -5, lowMidDb: -30 }
  },
  evaluatedAt: EVALUATED_AT
});
assert.equal(dimensions(precedence).tonal_character.status, "matched");
assert.equal(dimensions(precedence).tonal_character.evidenceSource, "track_analysis_v2");

assert.deepEqual(high.correctionPlan.change, [], "matched dimensions are not rewritten");
assert.ok(medium.correctionDirections.length > 0, "meaningful mismatches create next-generation directions");

console.log("song architect generation match tests passed");
