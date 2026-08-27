/**
 * Generation Match productization tests — API integration, ownership, public
 * response shape, UI wiring, and proof that quota / Reference Track systems
 * stay outside this feature.
 *
 * Run:
 * node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/song-architect-generation-match-product-test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { evaluateGenerationMatch } from "@/lib/song-architect/generation-match";
import { trackAnalysisToGenerationMatchEvidence } from "@/lib/song-architect/generation-match-evidence";
import {
  buildImprovedGenerationPrompt,
  toPublicGenerationMatchResult
} from "@/lib/song-architect/generation-match-public";
import { runGenerationMatchFromTrackAnalysis } from "@/lib/song-architect/generation-match-service";
import {
  authorizeGenerationMatchOwnership,
  parseSongDNAReference,
  rejectUnsupportedResultReference
} from "@/lib/song-architect/generation-match-validate";

const ROOT = process.cwd();
const EVALUATED_AT = "2026-08-26T12:00:00.000Z";

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function songDNA(overrides = {}) {
  return {
    composition: {
      theme: "fixture",
      angle: "fixture",
      emotionalIntent: "dark but hopeful",
      hookIdentity: "fixture hook",
      lyricalPerspective: "first person",
      language: "English",
      structure: "Verse 1 > Chorus > Verse 2 > Final Chorus",
      runtime: "~3 minutes",
      lineDensity: "balanced",
      vocalStyle: "",
      mustInclude: [],
      avoidWords: [],
      energyCurve: "4,8,5,9"
    },
    sonic: {
      primaryGenre: "pop",
      bpm: 94,
      productionAesthetic: "dark nocturnal production",
      bassCharacter: "full weight, deep bass",
      dynamics: "natural dynamics with open transient movement"
    },
    arrangement: {
      globalArc: "restrained verses into high-energy choruses",
      sections: [
        { id: "section-0", label: "Verse 1", sectionType: "verse", energy: 4, spatialDirection: "narrow centered" },
        { id: "section-1", label: "Chorus", sectionType: "chorus", energy: 8, spatialDirection: "wide chorus" },
        { id: "section-2", label: "Verse 2", sectionType: "verse", energy: 5, spatialDirection: "narrow centered" },
        { id: "section-3", label: "Final Chorus", sectionType: "final-chorus", energy: 9, spatialDirection: "widest final chorus" }
      ]
    },
    meta: {
      genreFamily: "pop",
      inferenceMode: "automatic",
      userOverrides: []
    },
    ...overrides
  };
}

function v1Analysis(overrides = {}) {
  return {
    durationSec: 187,
    integratedLufs: -14,
    peakDb: -1.2,
    meanDb: -18,
    crestDb: 9.5,
    lowEndDb: -12,
    lowMidDb: -20,
    harshnessDb: -28,
    airDb: -32,
    alreadyLimited: false,
    notes: [],
    ...overrides
  };
}

function v2Summary(overrides = {}) {
  return {
    schemaVersion: 2,
    integratedLufs: -14,
    loudnessRangeLu: 7,
    truePeakDb: -1,
    samplePeakDb: -1.2,
    crestFactorDb: 9.5,
    peakToLoudnessRatioDb: 12,
    spectralCentroidHz: 1100,
    spectralSlopeDbPerOct: -4.2,
    stereoCorrelation: 0.2,
    stereoWidthRatio: 0.62,
    channelMode: "stereo",
    durationSec: 187,
    sampleRateHz: 44100,
    activeFlags: ["low_end_excess"],
    analyzedStereo: true,
    subprocessCount: 4,
    ...overrides
  };
}

function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
}

function assertExcludes(content, needle, context) {
  assert.ok(!content.includes(needle), `${context}: must not include "${needle}"`);
}

function assertBefore(content, firstNeedle, laterNeedle, context) {
  const first = content.indexOf(firstNeedle);
  const later = content.indexOf(laterNeedle);
  assert.notEqual(first, -1, `${context}: missing "${firstNeedle}"`);
  assert.notEqual(later, -1, `${context}: missing "${laterNeedle}"`);
  assert.ok(first < later, `${context}: expected "${firstNeedle}" before "${laterNeedle}"`);
}

// 1. Valid Song DNA + valid generated-track analysis
const intended = songDNA();
const originalJson = JSON.stringify(intended);
const evaluated = runGenerationMatchFromTrackAnalysis({
  songDNA: intended,
  analysis: v1Analysis(),
  analysisV2: v2Summary(),
  stylePrompt: "dark nocturnal pop, 94 BPM",
  sunoBlueprint: "restrained verses into wide choruses",
  evaluatedAt: EVALUATED_AT
});
assert.equal(evaluated.ok, true, "valid DNA + analysis succeeds");
if (!evaluated.ok) throw new Error("expected success");
assert.equal(evaluated.response.match.overall, "high");
assert.equal(evaluated.response.match.evaluatedAt, EVALUATED_AT);
assert.ok(evaluated.response.match.dimensions.some((dimension) => dimension.id === "tonal_character"));
assert.equal(JSON.stringify(intended), originalJson, "original Song DNA object is not mutated");

const engineDirect = evaluateGenerationMatch({
  songDNA: songDNA(),
  analysis: trackAnalysisToGenerationMatchEvidence({
    analysis: v1Analysis(),
    analysisV2: v2Summary()
  }),
  evaluatedAt: EVALUATED_AT
});
assert.equal(evaluated.response.match.overall, engineDirect.overall, "product path matches engine overall");
assert.equal(
  evaluated.response.match.dimensions.map((dimension) => dimension.id).join(","),
  engineDirect.dimensions.map((dimension) => dimension.id).join(","),
  "product path reuses engine dimensions"
);

const mapped = trackAnalysisToGenerationMatchEvidence({
  analysis: v1Analysis(),
  analysisV2: v2Summary()
});
assert.equal("tempo" in mapped, false, "production analysis does not invent tempo");
assert.equal("sectionEnergy" in mapped, false, "production analysis does not invent section energy");
assert.equal("sectionStereoWidth" in mapped, false, "production analysis does not invent section width");
assert.equal(mapped.v2?.spectralSlopeDbPerOct, -4.2);
assert.equal(mapped.v1?.crestDb, 9.5);

// 2. Invalid / missing Song Architect reference
assert.equal(parseSongDNAReference(undefined).ok, false);
assert.equal(parseSongDNAReference(undefined).code, "missing_song_architect_reference");
assert.equal(parseSongDNAReference("not-json").ok, false);
assert.equal(parseSongDNAReference("not-json").code, "invalid_song_architect_reference");
assert.equal(parseSongDNAReference({ sonic: {} }).ok, false);
assert.equal(parseSongDNAReference({ sonic: {} }).code, "invalid_song_architect_reference");
assert.equal(parseSongDNAReference(JSON.stringify(songDNA())).ok, true);

const missingWithId = rejectUnsupportedResultReference({ resultId: "gen_abc123" }, false);
assert.equal(missingWithId?.code, "song_architect_result_not_found");
const malformedId = rejectUnsupportedResultReference({ resultId: "???" }, false);
assert.equal(malformedId?.code, "invalid_song_architect_reference");
const ignoredId = rejectUnsupportedResultReference({ resultId: "gen_abc123" }, true);
assert.equal(ignoredId, null, "valid Song DNA is used instead of an unresolved result ID");

// 3. Ownership protection
assert.equal(
  authorizeGenerationMatchOwnership({
    trustedEmail: "owner@example.com",
    claimed: { ownerEmail: "other@example.com" }
  }).ok,
  false
);
assert.equal(
  authorizeGenerationMatchOwnership({
    trustedEmail: "owner@example.com",
    claimed: { ownerEmail: "other@example.com" }
  }).code,
  "ownership_mismatch"
);
assert.equal(
  authorizeGenerationMatchOwnership({
    trustedEmail: "owner@example.com",
    claimed: { userId: "user_123" }
  }).code,
  "ownership_rejected"
);
assert.equal(
  authorizeGenerationMatchOwnership({
    trustedEmail: "owner@example.com",
    claimed: { ownerId: "acct_123" }
  }).code,
  "ownership_rejected"
);
assert.equal(
  authorizeGenerationMatchOwnership({
    trustedEmail: "owner@example.com",
    claimed: { ownerEmail: "owner@example.com" }
  }).ok,
  true
);
assert.equal(
  authorizeGenerationMatchOwnership({
    trustedEmail: "owner@example.com",
    claimed: {}
  }).ok,
  true
);

const routeSource = read("app/api/song-architect/generation-match/route.ts");
assertIncludes(routeSource, "resolveSongArchitectVerifiedContext", "route uses Song Architect access context");
assertIncludes(routeSource, "hasTrustedEmailAccess", "route requires trusted email access");
assertBefore(
  routeSource,
  "if (!hasTrustedEmailAccess(request, access.normalizedEmail))",
  "await analyzeTrackWithV2",
  "trusted email gate runs before audio analysis"
);
assertBefore(
  routeSource,
  "authorizeGenerationMatchOwnership({",
  "runGenerationMatchFromTrackAnalysis({",
  "ownership check runs before evaluator"
);
assertExcludes(routeSource, "formData.get(\"analysis\")", "route does not accept client-provided analysis");
assertExcludes(routeSource, "claimed.ownerId ?? access", "route never authorizes from client ownership IDs");

// 4. Evaluator integration
const serviceSource = read("lib/song-architect/generation-match-service.ts");
assertIncludes(serviceSource, "evaluateGenerationMatch", "service calls existing evaluator");
assertIncludes(serviceSource, "trackAnalysisToGenerationMatchEvidence", "service maps existing analysis evidence");
assertExcludes(serviceSource, "evaluateMasterReadiness", "service does not embed Master Readiness");
assertExcludes(serviceSource, "@/lib/ar-ai", "service does not import A&R / Hit Analyzer");

// 5. Normalized API response
const publicResult = toPublicGenerationMatchResult(engineDirect);
assert.equal("internalScore" in publicResult, false, "internalScore is not returned to the browser");
assert.equal("match" in publicResult, false);
assert.ok(Array.isArray(publicResult.dimensions));
assert.ok(publicResult.correctionPlan);
assert.equal(publicResult.overall, engineDirect.overall);
assert.deepEqual(publicResult.matched, engineDirect.matched);
assert.ok(!JSON.stringify(publicResult).includes("SYSTEM PROMPT"));
assert.ok(!JSON.stringify(evaluated.response).includes("internalScore"));
assert.ok("match" in evaluated.response);
assert.ok("improvedGenerationPrompt" in evaluated.response);

const mismatch = runGenerationMatchFromTrackAnalysis({
  songDNA: songDNA(),
  analysis: v1Analysis({ crestDb: 4, meanDb: -8, peakDb: -0.2 }),
  analysisV2: v2Summary({
    spectralSlopeDbPerOct: -0.2,
    stereoWidthRatio: 0.12,
    activeFlags: ["low_end_weak"],
    crestFactorDb: 4,
    loudnessRangeLu: 2
  }),
  stylePrompt: "dark nocturnal pop",
  evaluatedAt: EVALUATED_AT
});
assert.equal(mismatch.ok, true);
if (!mismatch.ok) throw new Error("expected mismatch success");
assert.ok(mismatch.response.improvedGenerationPrompt, "mismatches produce a derived next-generation prompt");
assert.ok(mismatch.response.improvedGenerationPrompt.includes("Next generation notes"));
assert.ok(mismatch.response.improvedGenerationPrompt.includes("dark nocturnal pop"));

const derived = buildImprovedGenerationPrompt({
  stylePrompt: "original style prompt",
  sunoBlueprint: "original blueprint",
  correctionPlan: { preserve: ["the 94 BPM pulse"], change: ["return the pulse closer to 94 BPM"] }
});
assert.ok(derived?.includes("original style prompt"));
assert.ok(derived?.includes("Keep the 94 BPM pulse"));
assert.equal(
  buildImprovedGenerationPrompt({
    stylePrompt: "original",
    correctionPlan: { preserve: ["tempo"], change: [] }
  }),
  null,
  "perfect matches do not invent a revision prompt"
);

// 6. Failure handling
const failedAnalysis = runGenerationMatchFromTrackAnalysis({
  songDNA: songDNA(),
  analysis: {
    durationSec: null,
    integratedLufs: null,
    peakDb: null,
    meanDb: null,
    crestDb: null,
    lowEndDb: null,
    lowMidDb: null,
    harshnessDb: null,
    airDb: null,
    alreadyLimited: false,
    notes: []
  },
  evaluatedAt: EVALUATED_AT
});
assert.equal(failedAnalysis.ok, false);
assert.equal(failedAnalysis.code, "analysis_failed");
assert.equal("response" in failedAnalysis, false, "failed analysis does not return a match payload");

assertIncludes(routeSource, '"unsupported_audio"', "unsupported files fail with a stable code");
assertIncludes(routeSource, '"analysis_failed"', "analysis failures use a stable code");
assertIncludes(routeSource, "Only WAV or MP3 uploads are supported", "unsupported files fail safely");
assertExcludes(routeSource, "message: error.message", "route does not leak raw exception text to the client");
assertExcludes(routeSource, "error: error.message", "route does not return raw exception text");
assertExcludes(routeSource, "stderr", "route does not leak analyzer stderr");
assertExcludes(routeSource, "system prompt", "route does not mention internal prompts");

// 7. UI source integration
const page = read("app/song-architect/page.tsx");
const panel = read("components/song-architect/generation-match-panel.tsx");
assertIncludes(page, "GenerationMatchPanel", "Song Architect output includes Generation Match");
assertIncludes(page, "result.basic.songDNA", "panel is wired to the existing Song DNA result");
assertIncludes(panel, "Check Generation Match", "panel exposes the check action");
assertIncludes(panel, "/api/song-architect/generation-match", "panel posts to the Generation Match API");
assertIncludes(panel, "A. Matched the intended design", "results distinguish matches");
assertIncludes(panel, "B. Deviated from the intended design", "results distinguish divergences");
assertIncludes(panel, "C. Suggestions for the next generation", "results distinguish next-generation suggestions");
assertIncludes(panel, "Improve Generation Prompt", "panel exposes the derived prompt action");
assertIncludes(panel, "not a prediction of commercial success", "UI does not claim commercial prediction");
assertExcludes(panel, "internalScore", "UI does not render the internal score");
assertExcludes(panel, "hit potential", "UI does not claim hit potential");

// 8. Preservation of original Song DNA
assertExcludes(serviceSource, "input.songDNA.", "service does not write into the original Song DNA");
assertIncludes(serviceSource, "structuredClone(input.songDNA)", "service clones Song DNA before evaluation");
assertExcludes(panel, "setResult", "panel does not replace the Song Architect result");
assertExcludes(panel, "songDNA.sonic", "panel does not mutate Song DNA fields");
assert.equal(page.includes("setResult(data.match)"), false, "page does not overwrite the blueprint with match results");
assertIncludes(panel, "keeps the original Song DNA unchanged", "derived prompt is presented as non-destructive");

// Duplicate submits do not corrupt state
assertIncludes(panel, "if (isSubmitting) return", "UI ignores duplicate in-flight submits");
assertIncludes(panel, "disabled={isSubmitting}", "submit control is disabled while in flight");
assertExcludes(routeSource, "update(", "route does not persist or update Song Architect rows");
assertExcludes(routeSource, ".insert(", "route does not insert Song Architect rows");

// 9. Analyze Your Song quota code is unchanged / unused
const quotaFiles = [
  "lib/ar-ai/limits.ts",
  "lib/ar-ai/usage.ts",
  "lib/ar-ai/access.ts",
  "app/api/ar-ai/route.ts"
];
for (const relPath of quotaFiles) {
  const source = read(relPath);
  assertExcludes(source, "generation-match", `${relPath} does not import Generation Match`);
  assertExcludes(source, "evaluateGenerationMatch", `${relPath} does not call the Generation Match engine`);
}
assertExcludes(routeSource, "@/lib/ar-ai/usage", "Generation Match does not consume Analyze Your Song usage");
assertExcludes(routeSource, "@/lib/ar-ai/limits", "Generation Match does not read Analyze Your Song limits");
assertExcludes(routeSource, "hit_analyzer_report_events", "Generation Match does not write analyzer quota events");
assertExcludes(routeSource, "recordHitAnalyzerReportEvent", "Generation Match does not record analyzer quota events");
assertExcludes(routeSource, "consumeHitAnalyzer", "Generation Match does not consume analyzer slots");
assertExcludes(routeSource, "recordSongArchitectGenerationEvent", "evaluation does not consume Song Architect generation quota");
assertExcludes(serviceSource, "hit_analyzer_report_events", "service does not touch analyzer quota events");

const limits = read("lib/ar-ai/limits.ts");
assertIncludes(limits, "HIT_ANALYZER_TIER_LIMITS", "Analyze Your Song limits module remains the quota source");
assertIncludes(limits, 'free: { limit: 2, period: "lifetime" }', "free analyzer lifetime limit is unchanged");

// 10. Reference Track remains outside this feature
const referenceFiles = [
  "app/api/song-architect/reference-track/route.ts",
  "app/api/song-architect/references/route.ts",
  "app/api/song-architect/references/[id]/route.ts",
  "components/song-architect/reference-track-panel.tsx",
  "components/song-architect/my-references-panel.tsx",
  "lib/song-architect/reference-style-blueprint.ts",
  "lib/song-architect/reference-track-service.ts",
  "lib/song-architect/saved-reference.ts",
  "lib/song-architect/saved-reference-access.ts",
  "lib/song-architect/saved-reference-service.ts",
  "lib/song-architect/saved-reference-store.ts",
  "lib/song-architect/spotify-metadata.ts",
  "lib/song-architect/spotify-url.ts"
];
for (const relPath of referenceFiles) {
  const source = read(relPath);
  assertExcludes(source, "generation-match-service", `${relPath} does not import Generation Match product code`);
  assertExcludes(source, "runGenerationMatchFromTrackAnalysis", `${relPath} does not call Generation Match`);
}
assertExcludes(routeSource, "reference-track", "Generation Match API does not call Reference Track");
assertExcludes(routeSource, "generateReferenceStyleBlueprint", "Generation Match API does not generate Style Blueprints");
assertExcludes(routeSource, "parseSpotifyTrackUrl", "Generation Match API does not parse Spotify URLs");
assertExcludes(panel, "ReferenceTrackPanel", "Generation Match UI does not mount Reference Track");
assertExcludes(panel, "reference-style-blueprint", "Generation Match UI does not import Style Blueprint");
assertExcludes(routeSource, "mastering-pipeline", "Generation Match does not master the uploaded track");
assertExcludes(routeSource, "adaptive-mastering", "Generation Match does not run adaptive mastering");
assertExcludes(page, "Generation Match is not advertised until", "page does not add pricing copy");

const pricing = read("components/pricing-section.tsx");
assert.ok(!pricing.includes("Generation Match"), "Generation Match is not added to pricing copy");

console.log("song architect generation match product tests passed");
