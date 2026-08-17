/**
 * Master Character bias tests for Adaptive Mastering.
 *
 * Run:
 *   node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/master-character-test.mjs
 *
 * No OpenAI, Stripe, Supabase, network, FFmpeg, or production credentials required.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ADAPTIVE_SETTING_BOUNDS,
  MASTER_CHARACTER_LIMITS,
  MASTER_CHARACTERS,
  DEFAULT_MASTER_CHARACTER,
  applyMasterCharacter,
  buildMasterCharacterContext,
  cloneMasterCharacterSettings,
  isMasterCharacter,
  masterCharacterSettingsEqual,
  parseMasterCharacter
} from "@/lib/audio/master-character";
import { buildMasteringDecisionReport } from "@/lib/audio/mastering-decision-report";
import { normalizeMasterCharacter } from "@/lib/audio/parse-adaptive-master-ai-fields";

const ROOT = process.cwd();

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing ${JSON.stringify(needle)}`);
}

function assertNotIncludes(content, needle, context) {
  assert.equal(content.includes(needle), false, `${context}: unexpected ${JSON.stringify(needle)}`);
}

function baseSettings(overrides = {}) {
  return {
    eqDirection: {
      lowEnd: 0,
      lowMid: 0,
      presence: 0.2,
      air: 0.1,
      ...(overrides.eqDirection ?? {})
    },
    compressionIntensity: overrides.compressionIntensity ?? "medium",
    saturationAmount: overrides.saturationAmount ?? 0.35,
    stereoWidth: overrides.stereoWidth ?? 1,
    targetLufs: overrides.targetLufs ?? -10,
    limiterCeilingDb: overrides.limiterCeilingDb ?? -1,
    transientHandling: overrides.transientHandling ?? "balanced",
    vocalPresenceEmphasis: overrides.vocalPresenceEmphasis ?? 0.35
  };
}

function maxAbsDelta(a, b) {
  return Math.abs(a - b);
}

function runParseTests() {
  assert.equal(DEFAULT_MASTER_CHARACTER, "recommended", "Recommended is the default Character");
  assert.equal(parseMasterCharacter(undefined), "recommended");
  assert.equal(parseMasterCharacter(null), "recommended");
  assert.equal(parseMasterCharacter(""), "recommended");
  assert.equal(parseMasterCharacter("   "), "recommended");
  assert.equal(parseMasterCharacter("Punchier"), "punchier");
  assert.equal(parseMasterCharacter("more-open"), "more_open");
  assert.equal(parseMasterCharacter("more open"), "more_open");
  assert.equal(parseMasterCharacter("not_a_character"), "recommended", "invalid resolves to Recommended");
  assert.equal(parseMasterCharacter({ eq: 12 }), "recommended", "objects cannot inject Character");
  assert.equal(isMasterCharacter("warmer"), true);
  assert.equal(isMasterCharacter("crush_everything"), false);
  assert.deepEqual([...MASTER_CHARACTERS], [
    "recommended",
    "punchier",
    "warmer",
    "more_open",
    "more_dynamic",
    "more_aggressive"
  ]);
}

function runRecommendedRegression() {
  const adaptive = baseSettings({
    eqDirection: { lowEnd: -1.2, lowMid: 0.4, presence: 0.8, air: -0.3 },
    compressionIntensity: "strong",
    saturationAmount: 0.6,
    stereoWidth: 1.08,
    targetLufs: -9.2,
    limiterCeilingDb: -0.8,
    transientHandling: "tight",
    vocalPresenceEmphasis: 1.1
  });

  const missing = applyMasterCharacter(adaptive, undefined);
  const recommended = applyMasterCharacter(adaptive, "recommended");
  const explicitDefault = applyMasterCharacter(adaptive, DEFAULT_MASTER_CHARACTER);

  assert.equal(missing.character, "recommended");
  assert.equal(recommended.character, "recommended");
  assert.ok(masterCharacterSettingsEqual(adaptive, missing.settings), "missing Character applies zero bias");
  assert.ok(masterCharacterSettingsEqual(adaptive, recommended.settings), "Recommended equals Adaptive settings");
  assert.ok(masterCharacterSettingsEqual(adaptive, explicitDefault.settings));
  assert.equal(recommended.biasApplied.limiterCeilingDbChanged, false);
  assert.equal(recommended.settings.limiterCeilingDb, adaptive.limiterCeilingDb);

  // Deep clone — mutating result must not mutate Adaptive baseline.
  const clone = cloneMasterCharacterSettings(adaptive);
  clone.eqDirection.lowEnd = 99;
  assert.equal(adaptive.eqDirection.lowEnd, -1.2);
}

function runPunchierTests() {
  const adaptive = baseSettings({
    compressionIntensity: "strong",
    transientHandling: "tight",
    targetLufs: -10
  });
  const result = applyMasterCharacter(adaptive, "punchier");
  assert.equal(result.settings.targetLufs, adaptive.targetLufs, "Punchier must not raise loudness to fake punch");
  assert.equal(result.settings.limiterCeilingDb, adaptive.limiterCeilingDb);
  assert.equal(result.settings.transientHandling, "balanced", "Punchier steps transient toward preserve");
  assert.equal(result.settings.compressionIntensity, "medium", "Punchier may ease strong compression one step");

  const limited = applyMasterCharacter(adaptive, "punchier", { alreadyLimited: true });
  assert.equal(
    limited.settings.compressionIntensity,
    "strong",
    "Punchier respects already-limited sources for compression"
  );
  assert.notEqual(limited.settings.transientHandling, "tight");
}

function runWarmerTests() {
  const protective = baseSettings({
    eqDirection: { lowEnd: -1.5, lowMid: -0.4, presence: 0, air: 0.4 },
    saturationAmount: 0.35
  });
  const result = applyMasterCharacter(
    protective,
    "warmer",
    buildMasterCharacterContext({
      alreadyLimited: false,
      lowEndDb: -16,
      adaptiveLowEndEqDb: -1.5
    })
  );

  assert.ok(result.settings.eqDirection.lowEnd === -1.5, "Warmer must not reverse protective low-end cut");
  assert.ok(result.settings.eqDirection.lowEnd <= protective.eqDirection.lowEnd, "Warmer never boosts lowEnd");
  assert.ok(result.settings.eqDirection.lowMid >= protective.eqDirection.lowMid, "Warmer may lift low-mids");
  assert.ok(
    maxAbsDelta(result.settings.eqDirection.lowMid, protective.eqDirection.lowMid) <= MASTER_CHARACTER_LIMITS.eqDb + 1e-9
  );
  assert.ok(result.settings.eqDirection.air <= protective.eqDirection.air, "Warmer may soften air");
  assert.equal(result.settings.limiterCeilingDb, protective.limiterCeilingDb);

  const openLowEnd = baseSettings({ eqDirection: { lowEnd: 0.2, lowMid: 0, presence: 0, air: 0.2 } });
  const warmerOpen = applyMasterCharacter(openLowEnd, "warmer");
  assert.equal(warmerOpen.settings.eqDirection.lowEnd, 0.2, "Warmer still does not blindly boost bass");
}

function runMoreOpenTests() {
  const adaptive = baseSettings({ stereoWidth: 1, eqDirection: { lowEnd: 0, lowMid: 0, presence: 0, air: 0 } });
  const open = applyMasterCharacter(adaptive, "more_open", { stereoIntent: "unspecified" });
  assert.ok(open.settings.eqDirection.air > adaptive.eqDirection.air);
  assert.ok(open.settings.stereoWidth > adaptive.stereoWidth);
  assert.ok(
    maxAbsDelta(open.settings.stereoWidth, adaptive.stereoWidth) <= MASTER_CHARACTER_LIMITS.stereoWidth + 1e-9
  );
  assert.ok(open.settings.stereoWidth <= ADAPTIVE_SETTING_BOUNDS.stereoWidth.max);

  const narrowed = applyMasterCharacter(adaptive, "more_open", { stereoIntent: "narrower" });
  assert.equal(narrowed.settings.stereoWidth, 1, "More Open cannot force width when Adaptive intent is narrower");

  const preserve = applyMasterCharacter(adaptive, "more_open", { stereoIntent: "preserve" });
  assert.equal(preserve.settings.stereoWidth, 1, "More Open respects preserve stereo intent");

  const alreadyNarrow = applyMasterCharacter(
    baseSettings({ stereoWidth: 0.82 }),
    "more_open",
    { stereoIntent: "wider" }
  );
  assert.equal(alreadyNarrow.settings.stereoWidth, 0.82, "More Open will not widen an Adaptive narrow decision");
}

function runMoreDynamicTests() {
  const adaptive = baseSettings({
    compressionIntensity: "strong",
    transientHandling: "tight",
    targetLufs: -9.5,
    limiterCeilingDb: -0.7
  });
  const result = applyMasterCharacter(adaptive, "more_dynamic");
  assert.equal(result.settings.compressionIntensity, "medium");
  assert.equal(result.settings.transientHandling, "balanced");
  assert.ok(result.settings.targetLufs < adaptive.targetLufs);
  assert.ok(
    maxAbsDelta(result.settings.targetLufs, adaptive.targetLufs) <= MASTER_CHARACTER_LIMITS.targetLufs + 1e-9
  );
  assert.equal(result.settings.limiterCeilingDb, adaptive.limiterCeilingDb, "More Dynamic never bypasses limiter");
  assert.notEqual(result.settings.compressionIntensity, undefined);
}

function runMoreAggressiveTests() {
  const adaptive = baseSettings({
    compressionIntensity: "medium",
    transientHandling: "preserve",
    targetLufs: -11,
    limiterCeilingDb: -1.1
  });
  const result = applyMasterCharacter(adaptive, "more_aggressive");
  assert.equal(result.settings.compressionIntensity, "strong");
  assert.equal(result.settings.transientHandling, "balanced");
  assert.ok(result.settings.targetLufs > adaptive.targetLufs);
  assert.ok(
    maxAbsDelta(result.settings.targetLufs, adaptive.targetLufs) <= MASTER_CHARACTER_LIMITS.targetLufs + 1e-9
  );
  assert.equal(result.settings.limiterCeilingDb, adaptive.limiterCeilingDb, "More Aggressive cannot move limiter");

  const limited = applyMasterCharacter(adaptive, "more_aggressive", { alreadyLimited: true });
  assert.ok(
    masterCharacterSettingsEqual(adaptive, limited.settings),
    "More Aggressive must not crush already-limited material"
  );
}

function runDecisionReportUsesFinalSettings() {
  const adaptive = baseSettings({
    compressionIntensity: "strong",
    transientHandling: "tight",
    targetLufs: -9.5,
    eqDirection: { lowEnd: 0, lowMid: 0, presence: 0, air: 0 }
  });
  const biased = applyMasterCharacter(adaptive, "more_dynamic");
  const report = buildMasteringDecisionReport({
    settings: biased.settings,
    baseline: {
      integratedLufs: -14,
      peakDb: -2,
      crestDb: 11,
      lowEndDb: -23,
      alreadyLimited: false
    },
    postMaster: {
      integratedLufs: -10.8,
      peakDb: -1.1,
      crestDb: 9.2
    }
  });
  assert.equal(report.selectedTargetLufs, biased.settings.targetLufs);
  assert.notEqual(report.selectedTargetLufs, adaptive.targetLufs);
  assert.ok(report.decisions.length > 0, "Decision Report still emits proven decisions from final settings");
  assert.equal(
    report.decisions.some((d) => /punchier character|warmer character|character enhanced/i.test(`${d.title} ${d.explanation}`)),
    false,
    "Decision Report must not invent Character commentary"
  );
}

function runApiFieldNormalization() {
  assert.equal(normalizeMasterCharacter({}), "recommended");
  assert.equal(normalizeMasterCharacter({ masterCharacter: "warmer" }), "warmer");
  assert.equal(normalizeMasterCharacter({ master_character: "more_open" }), "more_open");
  assert.equal(normalizeMasterCharacter({ character: "punchier" }), "punchier");
  assert.equal(normalizeMasterCharacter({ masterCharacter: 12 }), "recommended");
  assert.equal(
    parseMasterCharacter(normalizeMasterCharacter({ masterCharacter: "eqBoost=+12&ratio=20" })),
    "recommended",
    "client cannot inject DSP via Character field"
  );
}

function runSourceInvariants() {
  const characterSource = read("lib/audio/master-character.ts");
  assertIncludes(characterSource, "export function applyMasterCharacter", "character module exports applyMasterCharacter");
  assertIncludes(characterSource, "MASTER_CHARACTER_LIMITS", "centralized Character limits");
  assertIncludes(characterSource, "limiterCeilingDbChanged: false", "Character never claims limiter changes");
  assertNotIncludes(characterSource, "asoftclip=type", "Character module does not invent ffmpeg processors");
  assertNotIncludes(characterSource, "extrastereo=", "Character module does not invent stereo processors");

  const pipeline = read("lib/audio/adaptive-mastering-pipeline.ts");
  assertIncludes(pipeline, "applyMasterCharacter", "pipeline applies Character after Adaptive decisions");
  assertIncludes(pipeline, "adaptiveBaselineSettings", "pipeline preserves Adaptive baseline settings");
  assertIncludes(pipeline, "[ADAPTIVE_CHARACTER_DEBUG]", "dev observability for Character bias");

  const route = read("app/api/master-ai/route.ts");
  assertIncludes(route, "masterCharacter", "master-ai accepts Character");
  assertIncludes(route, "parseMasterCharacter", "master-ai validates Character server-side");
  assertNotIncludes(route, "eqDirection:", "clients cannot supply EQ via master-ai CoreBodySchema");

  const readiness = read("lib/audio/master-readiness.ts");
  assertNotIncludes(readiness, "applyMasterCharacter", "Master Readiness untouched by Character");

  const ab = read("lib/master-comparison/master-comparison.ts");
  assertNotIncludes(ab, "applyMasterCharacter", "A/B matching untouched by Character");
  assertNotIncludes(ab, "masterCharacter", "A/B matching untouched by Character");

  const pricingPage = read("app/pricing/page.tsx");
  const pricingSection = read("components/pricing-section.tsx");
  assertNotIncludes(pricingPage, "masterCharacter", "pricing page not modified for Character");
  assertNotIncludes(pricingSection, "masterCharacter", "pricing section not modified for Character");

  const upload = read("components/upload-form.tsx");
  assertIncludes(upload, "Master Character", "UI exposes Master Character");
  assertIncludes(upload, "DEFAULT_MASTER_CHARACTER", "UI defaults to Recommended");
  assertIncludes(upload, 'formData.append("masterCharacter", masterCharacter)', "UI sends Character enum only");

  const decisionReport = read("lib/audio/mastering-decision-report.ts");
  assertNotIncludes(decisionReport, "Punchier character", "no fabricated Character copy in Decision Report");
}

function runAll() {
  runParseTests();
  runRecommendedRegression();
  runPunchierTests();
  runWarmerTests();
  runMoreOpenTests();
  runMoreDynamicTests();
  runMoreAggressiveTests();
  runDecisionReportUsesFinalSettings();
  runApiFieldNormalization();
  runSourceInvariants();
  console.log("master-character-test: ok");
}

runAll();
