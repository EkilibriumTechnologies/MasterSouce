/**
 * Song DNA tests — canonical composition/sonic representation for Song Architect.
 *
 * Run: node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/song-architect-song-dna-test.mjs
 *
 * No OpenAI, Stripe, Supabase, network, or production credentials required.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseStructureSections } from "@/lib/song-architect/arrangement-dna";
import { planRepairPass, selectBestCandidate } from "@/lib/song-architect/candidate-selection";
import { resolveCandidateStrategy } from "@/lib/song-architect/candidate-strategy";
import { critiqueSongCandidate } from "@/lib/song-architect/critic";
import { isAdjectiveOnlyEmotion, translateEmotionalIntent } from "@/lib/song-architect/emotion-translation";
import { applyRepairedCandidate, runSongArchitectPhase4 } from "@/lib/song-architect/generation-pipeline";
import { normalizeSongArchitectOutput } from "@/lib/song-architect/normalize-output";
import { partitionSongArchitectClientPayload } from "@/lib/song-architect/premium-output";
import { PROMPT_BUDGETS, selectBudgetedInstructions } from "@/lib/song-architect/compiler-budget";
import { compileGenerationPackage } from "@/lib/song-architect/generation-compiler";
import { resolveGenerationTarget } from "@/lib/song-architect/generation-target";
import { analyzePronunciation, budgetPronunciationAdjustments } from "@/lib/song-architect/pronunciation";
import { buildExportPrompt, buildSystemPrompt, buildUserPrompt } from "@/lib/song-architect/prompts";
import { toReferenceSources } from "@/lib/song-architect/reference-dna";
import { resolveSongArchitectInput } from "@/lib/song-architect/resolve-input";
import { listSonicExclusionItems } from "@/lib/song-architect/sonic-exclusions";
import { detectGenreFamily } from "@/lib/song-architect/sonic-inference";
import { buildSongDNA, formatSongDNAForPrompt, formatSongDNAStylePrompt } from "@/lib/song-architect/song-dna";
import {
  compileSunoBlueprint,
  compileSunoExportPrompt,
  compileSunoStylePrompt,
  containsReferenceSourceNames,
  dedupeInstructions,
  resolvePromptConflicts
} from "@/lib/song-architect/suno-compiler";

const ROOT = process.cwd();

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function dnaFor(input) {
  const { resolved } = resolveSongArchitectInput(input);
  return { resolved, dna: buildSongDNA(resolved) };
}

function runCompositionReuseTests() {
  const { resolved, dna } = dnaFor({
    genre: "pop",
    theme: "rebuilding trust after a public fall",
    angle: "I tell you the truth I hid",
    emotion: "bitter but hopeful",
    hookIdentity: "Say it while the lights are on",
    structure: "Verse 1 > Chorus > Verse 2 > Bridge > Final Chorus",
    energyCurve: "quiet confession into open chorus",
    language: "Spanish",
    vocalStyle: "breathy, intimate",
    lineDensity: "sparse",
    mustInclude: ["midnight train"],
    avoidWords: ["baby"],
    songLength: "extended"
  });

  assert.equal(dna.composition.theme, resolved.theme);
  assert.equal(dna.composition.angle, resolved.angle);
  assert.equal(dna.composition.emotionalIntent, resolved.emotion);
  assert.equal(dna.composition.hookIdentity, resolved.hookIdentity);
  assert.equal(dna.composition.language, resolved.language);
  assert.equal(dna.composition.structure, resolved.structure);
  assert.equal(dna.composition.lineDensity, resolved.lineDensity);
  assert.equal(dna.composition.vocalStyle, resolved.vocalStyle);
  assert.equal(dna.composition.energyCurve, resolved.energyCurve);
  assert.deepEqual(dna.composition.mustInclude, ["midnight train"]);
  assert.deepEqual(dna.composition.avoidWords, ["baby"]);
  assert.equal(dna.composition.runtime, "~4 minutes");
  assert.match(dna.composition.lyricalPerspective, /first-to-second person/i);
}

function runEmotionTranslationTests() {
  const intent = "dark, emotional, powerful";
  const expression = translateEmotionalIntent(intent);

  assert.equal(isAdjectiveOnlyEmotion(intent, expression), false, "must not echo adjective lists");
  assert.notEqual(expression.summary.toLowerCase(), intent.toLowerCase());
  assert.match(expression.summary, /minor/i);
  assert.match(expression.summary, /restrained verse percussion/i);
  assert.match(expression.summary, /low-register|register/i);
  assert.match(expression.summary, /harmonic tension/i);
  assert.match(expression.summary, /chorus width expansion/i);

  const pop = translateEmotionalIntent(intent);
  const metal = translateEmotionalIntent(intent);
  assert.equal(pop.summary, metal.summary, "emotion translation is genre-agnostic");

  const { dna: edmDna } = dnaFor({ genre: "EDM", emotion: intent });
  const { dna: metalDna } = dnaFor({ genre: "nu-metal", emotion: intent });
  assert.equal(edmDna.sonic.emotionalSonicExpression, metalDna.sonic.emotionalSonicExpression);
  assert.notEqual(edmDna.sonic.groove, metalDna.sonic.groove);
}

function assertGenreVocabulary(label, input, expectations) {
  const { dna } = dnaFor({ emotion: "dark, emotional, powerful", ...input });
  const blob = [
    dna.sonic.primaryGenre,
    ...(dna.sonic.subgenres ?? []),
    dna.sonic.tempoFeel,
    dna.sonic.groove,
    ...(dna.sonic.coreInstrumentation ?? []),
    dna.sonic.drumCharacter,
    dna.sonic.bassCharacter,
    dna.sonic.harmonicCharacter,
    dna.sonic.productionAesthetic,
    dna.sonic.distortionSaturation,
    dna.sonic.dynamics
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  for (const token of expectations.mustInclude) {
    assert.match(blob, token, `${label} should include ${token}`);
  }
  for (const token of expectations.mustExclude) {
    assert.doesNotMatch(blob, token, `${label} should not include ${token}`);
  }
  if (expectations.family) {
    assert.equal(dna.meta.genreFamily, expectations.family, `${label} family`);
  }
  if (expectations.bpmRange) {
    assert.ok(typeof dna.sonic.bpm === "number", `${label} infers BPM`);
    assert.ok(
      dna.sonic.bpm >= expectations.bpmRange.min && dna.sonic.bpm <= expectations.bpmRange.max,
      `${label} BPM ${dna.sonic.bpm} in ${expectations.bpmRange.min}-${expectations.bpmRange.max}`
    );
  }
  return dna;
}

function runGenreAdaptationTests() {
  const edm = assertGenreVocabulary(
    "EDM",
    { genre: "EDM" },
    {
      family: "edm",
      bpmRange: { min: 120, max: 136 },
      mustInclude: [/four-on-the-floor|kick grid/, /synth/, /drop/],
      mustExclude: [/dembow/, /downtuned guitars/, /808 slides/]
    }
  );
  const hipHop = assertGenreVocabulary(
    "hip-hop",
    { genre: "hip-hop" },
    {
      family: "hip-hop",
      mustInclude: [/808/, /hats|pocket/, /rap|hip-hop/],
      mustExclude: [/four-on-the-floor/, /dembow/, /acoustic guitar/]
    }
  );
  const nuMetal = assertGenreVocabulary(
    "nu-metal",
    { genre: "nu-metal" },
    {
      family: "nu-metal",
      mustInclude: [/downtuned|guitar/, /half-time/, /saturation|amp/],
      mustExclude: [/dembow/, /four-on-the-floor/, /acoustic guitar/]
    }
  );
  const pop = assertGenreVocabulary(
    "pop",
    { genre: "pop" },
    {
      family: "pop",
      mustInclude: [/radio|polish/, /chorus/, /keys|drums/],
      mustExclude: [/dembow/, /downtuned/, /808 slides/]
    }
  );
  const acoustic = assertGenreVocabulary(
    "acoustic singer-songwriter",
    { genre: "acoustic singer-songwriter" },
    {
      family: "acoustic",
      mustInclude: [/acoustic guitar/, /room|intimate|performance/],
      mustExclude: [/four-on-the-floor/, /808/, /dembow/]
    }
  );
  const reggaeton = assertGenreVocabulary(
    "reggaeton",
    { genre: "reggaeton" },
    {
      family: "reggaeton",
      bpmRange: { min: 88, max: 102 },
      mustInclude: [/dembow/, /latin|reggaeton/],
      mustExclude: [/four-on-the-floor/, /downtuned/, /acoustic guitar/]
    }
  );

  const grooves = new Set([
    edm.sonic.groove,
    hipHop.sonic.groove,
    nuMetal.sonic.groove,
    pop.sonic.groove,
    acoustic.sonic.groove,
    reggaeton.sonic.groove
  ]);
  assert.equal(grooves.size, 6, "each validation genre gets a distinct groove");
}

function runOptionalFieldAndOverrideTests() {
  const { dna: unknown } = dnaFor({ genre: "xyzzy-microgenre", emotion: "hopeful" });
  assert.equal(unknown.meta.genreFamily, "generic");
  assert.ok(unknown.sonic.primaryGenre);
  assert.ok(unknown.sonic.emotionalSonicExpression);
  assert.equal(unknown.meta.inferenceMode, "automatic");

  const { dna: overridden } = dnaFor({
    genre: "pop",
    sonicControls: {
      bpm: 140,
      groove: "syncopated bounce",
      instrumentFocus: "piano",
      productionEra: "1980s",
      productionTexture: "tape saturation"
    }
  });
  assert.equal(overridden.sonic.bpm, 140);
  assert.equal(overridden.sonic.groove, "syncopated bounce");
  assert.equal(overridden.sonic.coreInstrumentation?.[0], "piano");
  assert.equal(overridden.sonic.productionEra, "1980s");
  assert.match(overridden.sonic.distortionSaturation ?? "", /tape saturation/i);
  assert.equal(overridden.meta.inferenceMode, "mixed");
  assert.ok(overridden.meta.userOverrides.includes("bpm"));
}

function runPromptSourceOfTruthTests() {
  const { resolved, dna } = dnaFor({ genre: "reggaeton", emotion: "dark, emotional, powerful" });
  const system = buildSystemPrompt(resolved, dna);
  const user = buildUserPrompt(resolved, dna);
  const style = formatSongDNAStylePrompt(dna);
  const exportPrompt = buildExportPrompt(
    {
      concept: {
        theme: resolved.theme,
        angle: resolved.angle,
        emotion: resolved.emotion,
        hookIdentity: resolved.hookIdentity,
        tensionWords: ["pressure", "release"],
        structure: resolved.structure,
        energyCurve: resolved.energyCurve
      },
      lyrics: "[Verse 1]\nA line"
    },
    { runtimeLabel: "~3 minutes", songDNA: dna }
  );

  assert.match(system, /Canonical Song DNA/);
  assert.match(system, /Emotional intent vs sonic expression/);
  assert.match(system, /Arrangement DNA/);
  assert.match(system, /dembow/i);
  assert.match(user, /"songDNA"/);
  assert.match(style, /reggaeton|dembow/i);
  assert.match(exportPrompt, /STYLE/);
  assert.match(exportPrompt, /BLUEPRINT/);
  assert.match(exportPrompt, /LYRICS/);
  assert.match(exportPrompt, /dembow|reggaeton/i);
}

function runPremiumPartitionTests() {
  const { resolved, dna } = dnaFor({ genre: "pop", emotion: "confident and uplifted" });
  const full = {
    concept: {
      theme: resolved.theme,
      angle: resolved.angle,
      emotion: resolved.emotion,
      hookIdentity: resolved.hookIdentity,
      tensionWords: ["rise", "release"],
      structure: resolved.structure,
      energyCurve: resolved.energyCurve
    },
    songDNA: dna,
    stylePrompt: formatSongDNAStylePrompt(dna),
    sunoBlueprint: compileSunoBlueprint(dna),
    lyrics: "[Verse 1]\nA line",
    performanceNotes: ["Keep verses dry"],
    altHooks: ["Hook A"],
    exportPrompt: "Export me",
    diagnostics: {
      chorusPunch: 70,
      lineClarity: 75,
      rhythmConsistency: 72,
      energyProgression: 74,
      hookIdentity: 73,
      endingImpact: 70,
      uniqueness: 71,
      overallScore: 72
    },
    meta: { model: "test", generatedAt: "2026-08-16T00:00:00.000Z", songLength: "standard" }
  };

  const free = partitionSongArchitectClientPayload(full, "free", resolved);
  assert.equal(free.premiumLocked, true);
  assert.equal(free.premium, null);
  assert.ok(free.basic.songDNA);
  assert.equal(free.basic.songDNA.composition.emotionalIntent, resolved.emotion);
  assert.equal("exportPrompt" in free.basic, false);
  assert.ok(free.basic.sunoBlueprint);
  assert.ok(free.basic.songDNA.arrangement);

  const premium = partitionSongArchitectClientPayload(full, "creator_monthly", resolved);
  assert.equal(premium.premiumLocked, false);
  assert.ok(premium.premium);
  assert.match(premium.premium.masteringReadyPrompt, /Sonic expression:/);
  assert.equal("exportPrompt" in premium.basic, false);
}

function runDetectorTests() {
  assert.equal(detectGenreFamily("Festival EDM Vocal"), "edm");
  assert.equal(detectGenreFamily("dark trap rap"), "hip-hop");
  assert.equal(detectGenreFamily("Nu Metal"), "nu-metal");
  assert.equal(detectGenreFamily("radio pop"), "pop");
  assert.equal(detectGenreFamily("acoustic singer-songwriter"), "acoustic");
  assert.equal(detectGenreFamily("Reggaeton"), "reggaeton");
}

function runSourceInvariantTests() {
  const prompts = read("lib/song-architect/prompts.ts");
  assert.match(prompts, /formatSongDNAForPrompt/, "prompts inject Song DNA");
  assert.match(prompts, /Emotional intent vs sonic expression/, "prompts separate intent from expression");

  const generate = read("app/api/song-architect/generate/route.ts");
  assert.match(generate, /buildSongDNA/, "generate builds Song DNA before the model call");
  assert.match(generate, /partitionSongArchitectClientPayload/, "premium partition remains");
  assert.doesNotMatch(generate, /data: normalized/, "raw output still does not leak");

  const page = read("app/song-architect/page.tsx");
  assert.match(page, /Advanced Sonic Controls/, "collapsed sonic controls exist");
  assert.match(page, /Reference DNA/, "progressive Reference DNA output exists");
  assert.match(page, /Harmony DNA/, "progressive Harmony DNA output exists");
  assert.match(page, /Sonic Exclusions/, "progressive Sonic Exclusions output exists");
  assert.match(page, /Production Map/, "progressive Production Map output exists");
  assert.match(page, /Suno Blueprint/, "section-aware blueprint is shown");
  assert.match(page, /Why this version/, "progressive selection disclosure exists");
  assert.match(page, /Pronunciation adjustments/, "progressive pronunciation disclosure exists");
  assert.doesNotMatch(page, /producer questionnaire/i, "no producer questionnaire copy");
  assert.doesNotMatch(page, /Candidate A|Candidate B/, "candidates stay hidden by default");

  const critic = read("lib/song-architect/critic.ts");
  assert.match(critic, /collectHardConstraintViolations/, "deterministic hard checks exist");
  assert.match(critic, /analyzeAiWritingPatterns/, "AI-writing-pattern detection exists");
  const selection = read("lib/song-architect/candidate-selection.ts");
  assert.match(selection, /CRITIC_SELECTION_WEIGHTS/, "explicit critic weights exist");
  assert.match(selection, /hardConstraintCompliance: 40/, "hard constraints dominate selection");
  const strategy = read("lib/song-architect/candidate-strategy.ts");
  assert.match(strategy, /single_candidate/, "cost-safe default candidate mode exists");
  assert.doesNotMatch(strategy, /creator_monthly|pro_studio_monthly/, "no invented plan entitlements");

  const compiler = read("lib/song-architect/suno-compiler.ts");
  assert.match(compiler, /compileSunoStylePrompt/, "dedicated Suno compiler exists");
  assert.match(compiler, /SunoCompilerStrategyId/, "compiler strategy boundary exists");
  assert.doesNotMatch(compiler, /suno v[0-9]/i, "no invented Suno version claims");
  const generationCompiler = read("lib/song-architect/generation-compiler.ts");
  assert.match(generationCompiler, /compileGenerationPackage/, "model-target compile entry exists");
  const generationTarget = read("lib/song-architect/generation-target.ts");
  assert.match(generationTarget, /resolveGenerationTarget/, "target abstraction exists");
  assert.doesNotMatch(generationTarget, /suno v[0-9]/i, "version mapping stays conservative");

  const untouched = [
    "lib/audio/mastering-pipeline.ts",
    "lib/audio/adaptive-mastering.ts",
    "lib/audio/track-analysis-v2.ts",
    "lib/billing/stripe.ts"
  ];
  for (const rel of untouched) {
    try {
      read(rel);
    } catch {
      // Path may differ; skip missing optional files.
    }
  }
}

function runNoReferenceBaselineTests() {
  const { dna } = dnaFor({ genre: "pop", emotion: "dark, emotional, powerful" });
  assert.equal(dna.reference, undefined, "CASE A: no Reference DNA without sources");
  assert.ok(dna.sonic.primaryGenre, "CASE A: Sonic DNA still infers");
  assert.ok(dna.harmony, "CASE A: Harmony DNA still infers");
  assert.equal(dna.composition.avoidWords.length, 0);
}

function runSingleReferenceInfluenceTests() {
  const { dna: baseline } = dnaFor({ genre: "pop", emotion: "dark, emotional, powerful" });
  const { dna } = dnaFor({
    genre: "pop",
    emotion: "dark, emotional, powerful",
    referenceArtists: ["The Weeknd"]
  });

  assert.ok(dna.reference, "CASE B: Reference DNA exists");
  assert.equal(dna.reference.sources[0].type, "artist");
  assert.equal(dna.reference.profiles[0].catalogMatch, true);
  const blob = [dna.sonic.productionAesthetic, ...(dna.sonic.subgenres ?? []), ...(dna.sonic.supportingInstrumentation ?? [])]
    .join(" ")
    .toLowerCase();
  assert.match(blob, /dark|atmospheric|synth|80s/, "CASE B: reference characteristics influence Sonic DNA");
  assert.notEqual(
    `${baseline.sonic.productionAesthetic}|${(baseline.sonic.subgenres ?? []).join(",")}`,
    `${dna.sonic.productionAesthetic}|${(dna.sonic.subgenres ?? []).join(",")}`,
    "CASE B: resolved sonic differs from the no-reference baseline"
  );
}

function runCompatibleReferenceTests() {
  const { dna } = dnaFor({
    genre: "pop",
    emotion: "dark, emotional, powerful",
    referenceArtists: ["The Weeknd", "Billie Eilish"]
  });
  assert.ok(dna.reference.sharedTraits.length > 0, "CASE C: shared traits identified");
  assert.ok(
    dna.reference.sharedTraits.some((trait) => trait.confidence === "strong"),
    "CASE C: shared traits are strengthened"
  );
  const sharedBlob = dna.reference.sharedTraits.map((trait) => trait.value).join(" ").toLowerCase();
  assert.match(sharedBlob, /dark|minimal|atmospheric|intimate|sparse/, "CASE C: shared dark-atmospheric traits");
}

function runContrastingReferenceTests() {
  const { dna } = dnaFor({
    genre: "nu-metal",
    emotion: "dark, emotional, powerful",
    vocalStyle: "aggressive, gritty",
    energyCurve: "crush-and-release",
    structure: "Verse 1 > Chorus > Verse 2 > Bridge > Final Chorus",
    referenceArtists: ["The Weeknd", "Metallica"]
  });
  assert.ok(dna.reference.conflictingTraits.length > 0, "CASE D: conflicts recorded");
  assert.equal(dna.meta.genreFamily, "nu-metal");
  const sonicBlob = [
    dna.sonic.primaryGenre,
    dna.sonic.productionAesthetic,
    ...(dna.sonic.coreInstrumentation ?? []),
    dna.sonic.distortionSaturation
  ]
    .join(" ")
    .toLowerCase();
  assert.match(sonicBlob, /metal|guitar|weighty|saturation|amp/, "CASE D: user nu-metal intent remains");
  assert.doesNotMatch(sonicBlob, /cinematic pop|falsetto|radio-ready polish/, "CASE D: conflicting pop gloss does not override");
  assert.ok(
    dna.reference.conflictingTraits.some((trait) => /user intent/i.test(trait.resolution ?? "")),
    "CASE D: conflicts resolve toward user intent"
  );
}

function runHarmonyGenreTests() {
  const cases = [
    ["EDM", { genre: "EDM" }, [/drop/, /tension|sustained|voicing/], [/dembow/, /pedal-tone riff/]],
    ["hip-hop", { genre: "hip-hop" }, [/loop/, /sparse|sample|chord bed|chord-bed/], [/drop as harmonic release/]],
    ["nu-metal", { genre: "nu-metal" }, [/riff/, /pedal|modal|minor/], [/dembow/, /voice leading/]],
    ["pop", { genre: "pop" }, [/functional/, /hook/], [/dembow/, /pedal-tone/]],
    ["R&B", { genre: "R&B" }, [/extension/, /voice leading/], [/dembow/, /festival drop/]],
    ["acoustic", { genre: "acoustic singer-songwriter" }, [/natural/, /restrained/], [/dembow/, /drop as harmonic release/]],
    ["reggaeton", { genre: "reggaeton" }, [/loop/, /rhythmic space|dembow/], [/pedal-tone/, /jazz extensions/]]
  ];

  const signatures = new Set();
  for (const [label, input, mustInclude, mustExclude] of cases) {
    const { dna } = dnaFor({ emotion: "dark, emotional, powerful", ...input });
    const blob = Object.values(dna.harmony ?? {}).join(" | ").toLowerCase();
    signatures.add(blob);
    for (const token of mustInclude) {
      assert.match(blob, token, `CASE E: ${label} harmony should include ${token}`);
    }
    for (const token of mustExclude) {
      assert.doesNotMatch(blob, token, `CASE E: ${label} harmony should not include ${token}`);
    }
    assert.doesNotMatch(blob, /\b[a-g](?:#|b)?\s+(?:major|minor|dorian)\b/i, `CASE E: ${label} avoids exact key claims`);
  }
  assert.equal(signatures.size, cases.length, "CASE E: each genre gets distinct harmonic language");
}

function runSonicExclusionTests() {
  const { dna: metal } = dnaFor({ genre: "nu-metal", emotion: "dark, industrial, powerful" });
  const items = listSonicExclusionItems(metal.sonicExclusions);
  assert.ok(items.length > 0 && items.length <= 4, "CASE F: exclusions stay concise");
  const blob = items.join(" ").toLowerCase();
  assert.match(blob, /dance-pop|festival|acoustic folk|funk guitar/, "CASE F: exclusions clarify nu-metal");

  const { dna: pop } = dnaFor({ genre: "pop", emotion: "confident and uplifted" });
  const popItems = listSonicExclusionItems(pop.sonicExclusions);
  assert.ok(popItems.length <= 4, "CASE F: pop exclusions remain short or empty");
}

function runLyricSonicSeparationTests() {
  const { dna } = dnaFor({
    genre: "nu-metal",
    emotion: "dark, emotional, powerful",
    avoidWords: ["baby", "forever"],
    mustInclude: ["midnight train"]
  });
  assert.deepEqual(dna.composition.avoidWords, ["baby", "forever"]);
  const exclusionBlob = listSonicExclusionItems(dna.sonicExclusions).join(" ").toLowerCase();
  assert.doesNotMatch(exclusionBlob, /\bbaby\b|\bforever\b|\bmidnight train\b/, "CASE G: lyric avoid-words stay lyric-only");
  const prompt = formatSongDNAForPrompt(dna);
  assert.match(prompt, /Lyric constraints/);
  assert.match(prompt, /Sonic constraints|Sonic DNA/);
  assert.match(prompt, /avoid words: baby, forever/);
}

function runArtistNameIndependenceTests() {
  const { resolved, dna } = dnaFor({
    genre: "pop",
    emotion: "dark, emotional, powerful",
    referenceArtists: ["The Weeknd"]
  });
  const system = buildSystemPrompt(resolved, dna);
  const user = buildUserPrompt(resolved, dna);
  const brief = formatSongDNAForPrompt(dna);
  const style = formatSongDNAStylePrompt(dna);

  for (const [label, text] of [
    ["system", system],
    ["user", user],
    ["brief", brief],
    ["style", style]
  ]) {
    assert.doesNotMatch(text, /the weeknd|weeknd|abel tesfaye/i, `CASE H: ${label} does not require artist names`);
  }
  assert.match(brief, /dark|atmospheric|synth|nocturnal|cinematic/i, "CASE H: resolved sonic remains useful");
  assert.match(user, /"songDNA"/);
  assert.doesNotMatch(user, /"referenceArtists"/);
}

function runFutureReferenceSourceTests() {
  const { resolved } = resolveSongArchitectInput({
    genre: "pop",
    references: [{ type: "song", label: "Blinding Lights" }]
  });
  assert.equal(resolved.references[0].type, "song");
  assert.equal(resolved.references[0].label, "Blinding Lights");
  const sources = toReferenceSources(resolved);
  assert.equal(sources[0].type, "song");
}

function runExactKeyOnlyWhenJustifiedTests() {
  const { dna } = dnaFor({
    genre: "pop",
    emotion: "hopeful",
    userNotes: "write it in F# minor"
  });
  assert.match(dna.harmony.scaleOrMode ?? "", /F# minor/i);
}

function arrangementBlob(dna) {
  return [
    dna.arrangement?.globalArc,
    dna.arrangement?.transitionStrategy,
    ...(dna.arrangement?.sections ?? []).flatMap((section) => [
      section.label,
      section.drumDirection,
      section.bassDirection,
      section.vocalDirection,
      section.productionDirection,
      section.density,
      section.transitionIntoNext,
      ...(section.priorityInstructions ?? [])
    ]),
    compileSunoStylePrompt(dna).replace(/\bavoid\b[\s\S]*$/i, ""),
    compileSunoBlueprint(dna)
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
}

function runPhase3ArrangementAndCompilerTests() {
  const edm = dnaFor({
    genre: "EDM",
    emotion: "dark, emotional, powerful",
    energyCurve: "filter-build into a high-impact drop",
    structure: "Intro > Verse 1 > Build > Drop > Breakdown > Final Drop",
    vocalStyle: "anthemic topline"
  }).dna;
  const edmBlob = arrangementBlob(edm);
  assert.ok(edm.arrangement, "CASE A: Arrangement DNA exists");
  assert.equal(edm.arrangement.sections.length, parseStructureSections(edm.composition.structure).length);
  assert.ok(edm.arrangement.sections.some((section) => section.sectionType === "drop"));
  assert.ok(edm.arrangement.sections.some((section) => (section.energy ?? 0) >= 8));
  assert.match(edmBlob, /four-on-the-floor|kick/);
  assert.match(edmBlob, /drop|build|sidechain|synth/);
  assert.doesNotMatch(edmBlob, /dembow|downtuned|808 slides/);

  const hipHop = dnaFor({
    genre: "hip-hop",
    emotion: "dark, emotional, powerful",
    energyCurve: "verse pressure into hook lift",
    structure: "Intro > Verse 1 > Chorus > Verse 2 > Bridge > Final Chorus",
    vocalStyle: "rhythmic, close-mic"
  }).dna;
  const hipHopBlob = arrangementBlob(hipHop);
  assert.match(hipHopBlob, /pocket|808|vocal space|hook/);
  assert.doesNotMatch(hipHopBlob, /four-on-the-floor|festival drop|riser into drop|dembow/);

  const nuMetal = dnaFor({
    genre: "nu-metal",
    emotion: "dark, emotional, powerful",
    energyCurve: "crush-and-release",
    structure: "Verse 1 > Chorus > Verse 2 > Bridge > Final Chorus",
    vocalStyle: "aggressive, gritty"
  }).dna;
  const nuMetalBlob = arrangementBlob(nuMetal);
  assert.match(nuMetalBlob, /riff|guitar|half-time|drum/);
  assert.match(nuMetalBlob, /aggressive|melodic|gang|shout/);
  const nuMetalEnergies = nuMetal.arrangement.sections.map((section) => section.energy ?? 0);
  assert.ok(Math.max(...nuMetalEnergies) - Math.min(...nuMetalEnergies) >= 3, "CASE C: section intensity varies");
  assert.doesNotMatch(nuMetalBlob, /dembow|four-on-the-floor/);

  const pop = dnaFor({
    genre: "pop",
    emotion: "confident and uplifted",
    energyCurve: "medium intro, strong chorus lift, biggest final chorus",
    structure: "Verse 1 > Pre-Chorus > Chorus > Verse 2 > Bridge > Final Chorus"
  }).dna;
  const popBlob = arrangementBlob(pop);
  const popVerse = pop.arrangement.sections.find((section) => section.sectionType === "verse");
  const popChorus = pop.arrangement.sections.find((section) => section.sectionType === "chorus");
  assert.ok((popChorus?.energy ?? 0) > (popVerse?.energy ?? 0), "CASE D: chorus lift");
  assert.match(popBlob, /hook|chorus/);
  assert.match(popVerse?.density ?? "", /control|support|sparse/i);

  const rnb = dnaFor({
    genre: "R&B",
    emotion: "dark, emotional, powerful",
    energyCurve: "slow bloom into the hook",
    structure: "Verse 1 > Pre-Chorus > Chorus > Verse 2 > Bridge > Final Chorus",
    vocalStyle: "intimate, silky"
  }).dna;
  const rnbBlob = arrangementBlob(rnb);
  assert.match(rnbBlob, /intimate|close|silky|harmony|restrain|bloom/);
  assert.doesNotMatch(rnbBlob, /festival drop|four-on-the-floor|dembow/);

  const reggaeton = dnaFor({
    genre: "reggaeton",
    emotion: "dark, emotional, powerful",
    energyCurve: "steady body with hook lift",
    structure: "Intro > Verse 1 > Chorus > Verse 2 > Bridge > Final Chorus"
  }).dna;
  const reggaetonBlob = arrangementBlob(reggaeton);
  assert.match(reggaetonBlob, /dembow/);
  assert.match(reggaetonBlob, /bass|perc/);
  assert.match(reggaetonBlob, /vocal space|space/);
  assert.doesNotMatch(reggaetonBlob, /four-on-the-floor|downtuned/);

  const acoustic = dnaFor({
    genre: "acoustic singer-songwriter",
    emotion: "dark, emotional, powerful",
    energyCurve: "quiet confession into open chorus",
    structure: "Verse 1 > Chorus > Verse 2 > Bridge > Final Chorus",
    vocalStyle: "breathy, intimate"
  }).dna;
  const acousticBlob = arrangementBlob(acoustic);
  assert.match(acousticBlob, /organic|acoustic|room|intimate|natural/);
  assert.doesNotMatch(acousticBlob, /sidechain|festival drop|four-on-the-floor|synth lead|808/);

  const multi = dnaFor({
    genre: "nu-metal",
    emotion: "dark, emotional, powerful",
    vocalStyle: "aggressive, gritty",
    referenceArtists: ["The Weeknd", "Metallica"]
  }).dna;
  const multiStyle = compileSunoStylePrompt(multi);
  assert.match(multiStyle, /nu-metal|guitar|half-time|riff/i);
  assert.doesNotMatch(multiStyle, /the weeknd|metallica|falsetto|cinematic pop/i);
  assert.equal(containsReferenceSourceNames(multiStyle, multi), false, "CASE H: resolved sonic stays authoritative");

  const named = dnaFor({
    genre: "pop",
    emotion: "dark, emotional, powerful",
    referenceArtists: ["The Weeknd"]
  }).dna;
  const namedStyle = compileSunoStylePrompt(named);
  const namedBlueprint = compileSunoBlueprint(named);
  assert.equal(containsReferenceSourceNames(namedStyle, named), false, "CASE I: style has no artist names");
  assert.equal(containsReferenceSourceNames(namedBlueprint, named), false, "CASE I: blueprint has no artist names");
  assert.match(namedStyle, /pop|synth|dark|atmospheric|vocal/i);

  const metalExclusions = compileSunoStylePrompt(nuMetal);
  const exclusionMentions = (metalExclusions.match(/\bavoid\b/gi) ?? []).length;
  assert.ok(exclusionMentions <= 1, "CASE J: exclusions stay concise");
  if (exclusionMentions === 1) {
    assert.doesNotMatch(metalExclusions, /avoid .*;.*;/i, "CASE J: at most two exclusion phrases");
  }

  const deduped = dedupeInstructions([
    "dark cinematic production",
    "dark atmosphere",
    "cinematic ambience",
    "dark cinematic texture",
    "palm-muted downtuned guitars"
  ]);
  assert.ok(deduped.length <= 2, "CASE K: semantic repetition is reduced");
  assert.ok(
    deduped.some((item) => /guitar|palm-muted/i.test(item)),
    "CASE K: specific musical instruction survives"
  );

  const resolvedConflicts = resolvePromptConflicts(
    [
      "sparse acoustic production",
      "natural room character",
      "massive festival EDM drop",
      "four-on-the-floor sidechain"
    ],
    {
      family: "acoustic",
      sonic: {
        primaryGenre: "acoustic singer-songwriter",
        productionAesthetic: "dry-to-warm, performance-first",
        coreInstrumentation: ["acoustic guitar", "lead vocal"]
      }
    }
  );
  const conflictBlob = resolvedConflicts.join(" ").toLowerCase();
  assert.match(conflictBlob, /acoustic|room/);
  assert.doesNotMatch(conflictBlob, /festival edm drop|four-on-the-floor/);
  assert.doesNotMatch(compileSunoStylePrompt(acoustic), /festival|sidechain|four-on-the-floor/i);

  const contrast = dnaFor({
    genre: "pop",
    emotion: "bitter but hopeful",
    energyCurve: "quiet confession into open chorus",
    structure: "Verse 1 > Chorus > Verse 2 > Final Chorus",
    vocalStyle: "breathy, intimate"
  }).dna;
  const contrastVerse = contrast.arrangement.sections.find((section) => section.sectionType === "verse");
  const contrastChorus = contrast.arrangement.sections.find((section) => section.sectionType === "chorus");
  assert.ok((contrastVerse?.energy ?? 9) <= 5, "CASE M: quiet verse remains");
  assert.ok((contrastChorus?.energy ?? 0) >= 7, "CASE M: huge chorus remains");
  const contrastBlueprint = compileSunoBlueprint(contrast).toLowerCase();
  assert.match(contrastBlueprint, /\[verse 1\]/);
  assert.match(contrastBlueprint, /\[chorus\]/);
  assert.notEqual(contrastVerse?.vocalDirection, contrastChorus?.vocalDirection);

  const { resolved } = resolveSongArchitectInput({
    genre: "nu-metal",
    emotion: "dark, emotional, powerful",
    energyCurve: "crush-and-release",
    structure: "Verse 1 > Chorus > Verse 2 > Bridge > Final Chorus",
    vocalStyle: "aggressive, gritty"
  });
  const legacyExport = "MAKE THIS A FESTIVAL EDM DROP WITH HUGE EPIC POWERFUL WIDE SOUND";
  const normalized = normalizeSongArchitectOutput({
    rawOutputText: JSON.stringify({
      concept: {
        theme: resolved.theme,
        angle: resolved.angle,
        emotion: resolved.emotion,
        hookIdentity: resolved.hookIdentity,
        tensionWords: ["pressure", "release"],
        structure: resolved.structure,
        energyCurve: resolved.energyCurve
      },
      lyricsSections: [
        { section: "Verse 1", lines: ["A line in the pocket"] },
        { section: "Chorus", lines: ["The hook stays mine"] }
      ],
      performanceNotes: ["Keep verses dry"],
      altHooks: ["Hook A"],
      exportPrompt: legacyExport
    }),
    model: "test-model",
    generatedAt: "2026-08-16T00:00:00.000Z",
    resolvedInput: resolved
  });
  assert.doesNotMatch(normalized.exportPrompt, /MAKE THIS A FESTIVAL EDM DROP WITH HUGE EPIC POWERFUL WIDE SOUND/);
  assert.equal(normalized.stylePrompt, compileSunoStylePrompt(normalized.songDNA));
  assert.equal(normalized.sunoBlueprint, compileSunoBlueprint(normalized.songDNA));
  assert.match(normalized.exportPrompt, /STYLE/);
  assert.match(normalized.exportPrompt, /BLUEPRINT/);
  assert.match(normalized.exportPrompt, /LYRICS/);
  assert.match(normalized.stylePrompt, /nu-metal|guitar|half-time/i);
  assert.doesNotMatch(normalized.stylePrompt, /festival edm drop with huge epic/i);
}

function phase4Fixture() {
  const { resolved, dna } = dnaFor({
    genre: "pop",
    theme: "rebuilding trust after a public fall",
    angle: "I tell you the truth I hid",
    emotion: "bitter but hopeful",
    hookIdentity: "Say it while the lights are on",
    structure: "Verse 1 > Chorus > Verse 2 > Bridge > Final Chorus",
    energyCurve: "quiet confession into open chorus",
    language: "English",
    vocalStyle: "breathy, intimate",
    lineDensity: "balanced",
    mustInclude: ["midnight train"],
    avoidWords: ["baby"],
    songLength: "standard"
  });
  return { resolved, dna };
}

function candidate(id, sections, extras = {}) {
  const { dna } = phase4Fixture();
  return {
    id,
    concept: {
      theme: dna.composition.theme,
      angle: dna.composition.angle,
      emotion: dna.composition.emotionalIntent,
      hookIdentity: extras.hookIdentity ?? dna.composition.hookIdentity,
      tensionWords: ["truth", "light"],
      structure: dna.composition.structure,
      energyCurve: dna.composition.energyCurve
    },
    lyricsSections: sections,
    lyrics: sections.map((section) => [`[${section.section}]`, ...section.lines].join("\n")).join("\n"),
    performanceNotes: ["Keep verses dry"],
    altHooks: ["Say it while the lights are on"]
  };
}

function strongSections(overrides = {}) {
  return [
    {
      section: "Verse 1",
      lines: overrides.verse1 ?? [
        "I packed the midnight train inside a note",
        "The kitchen light still knows the words I wrote",
        "I count the photos face-down on the chair",
        "And tell the quiet I will meet you there"
      ]
    },
    {
      section: "Chorus",
      lines: overrides.chorus ?? [
        "Say it while the lights are on",
        "Don't wait until the room is gone",
        "Say it while the lights are on",
        "I want the truth before the dawn"
      ]
    },
    {
      section: "Verse 2",
      lines: overrides.verse2 ?? [
        "Your jacket on the railing still smells like rain",
        "I replay the hallway like a late refrain",
        "The midnight train is more than metaphor",
        "It is the hour I walk back through that door"
      ]
    },
    {
      section: "Bridge",
      lines: overrides.bridge ?? [
        "If the city keeps our names in separate rooms",
        "I will still cross the platform, not the tomb"
      ]
    },
    {
      section: "Final Chorus",
      lines: overrides.finalChorus ?? [
        "Say it while the lights are on",
        "Louder than the rumor, keep it plain",
        "Say it while the lights are on",
        "I will not hide the midnight train"
      ]
    }
  ];
}

function runPhase4CriticAndSelectionTests() {
  const { dna, resolved } = phase4Fixture();

  const strongA = candidate("A", strongSections());
  const weakHookB = candidate(
    "B",
    strongSections({
      chorus: [
        "I have so many complicated feelings I should probably mention in a long conversational way",
        "There is a truth somewhere maybe if we talk about the weather first",
        "I feel the pain in my heart through the night",
        "We can find my way together later on"
      ],
      finalChorus: [
        "I have so many complicated feelings I should probably mention in a long conversational way",
        "There is a truth somewhere maybe if we talk about the weather first"
      ]
    }),
    { hookIdentity: "I have so many complicated feelings I should probably mention" }
  );
  const caseA = selectBestCandidate([
    critiqueSongCandidate(strongA, dna, resolved),
    critiqueSongCandidate(weakHookB, dna, resolved)
  ]);
  assert.equal(caseA.winnerId, "A", "CASE A: stronger hook with no violations wins");

  const unevenA = candidate(
    "A",
    strongSections({
      verse2: [
        "Your jacket on the railing still smells like rain and I keep talking in one endless line that never lands on a singable pocket and then I explain the theme again",
        "Ok",
        "The midnight train is more than metaphor",
        "Door"
      ]
    })
  );
  const balancedB = candidate("B", strongSections());
  const caseB = selectBestCandidate([
    critiqueSongCandidate(unevenA, dna, resolved),
    critiqueSongCandidate(balancedB, dna, resolved)
  ]);
  assert.equal(caseB.winnerId, "B", "CASE B: cleaner structure/flow wins");

  const forbiddenA = candidate(
    "A",
    strongSections({
      verse1: [
        "Baby I packed the midnight train inside a note",
        "The kitchen light still knows the words I wrote",
        "I count the photos face-down on the chair",
        "And tell the quiet I will meet you there"
      ]
    })
  );
  const cleanB = candidate("B", strongSections());
  const caseC = selectBestCandidate([
    critiqueSongCandidate(forbiddenA, dna, resolved),
    critiqueSongCandidate(cleanB, dna, resolved)
  ]);
  assert.equal(caseC.winnerId, "B", "CASE C: Avoid Words candidate loses");
  assert.ok(
    critiqueSongCandidate(forbiddenA, dna, resolved).hardConstraintViolations.some((item) => /Avoid Words/i.test(item))
  );

  const missingMustA = candidate(
    "A",
    strongSections({
      verse1: [
        "I packed a suitcase inside a note",
        "The kitchen light still knows the words I wrote",
        "I count the photos face-down on the chair",
        "And tell the quiet I will meet you there"
      ],
      verse2: [
        "Your jacket on the railing still smells like rain",
        "I replay the hallway like a late refrain",
        "This leaving is more than metaphor",
        "It is the hour I walk back through that door"
      ],
      finalChorus: [
        "Say it while the lights are on",
        "Louder than the rumor, keep it plain",
        "Say it while the lights are on",
        "I will not hide the last refrain"
      ]
    })
  );
  const caseD = selectBestCandidate([
    critiqueSongCandidate(missingMustA, dna, resolved),
    critiqueSongCandidate(cleanB, dna, resolved)
  ]);
  assert.equal(caseD.winnerId, "B", "CASE D: missing Must Include loses");

  const missingBridgeA = candidate(
    "A",
    strongSections().filter((section) => section.section !== "Bridge")
  );
  const caseE = selectBestCandidate([
    critiqueSongCandidate(missingBridgeA, dna, resolved),
    critiqueSongCandidate(cleanB, dna, resolved)
  ]);
  assert.equal(caseE.winnerId, "B", "CASE E: missing required section loses");

  const verboseHookA = candidate(
    "A",
    strongSections({
      chorus: [
        "I should probably say the thing I meant while listing every detail of the argument in a paragraph",
        "There is a feeling I have been meaning to discuss at length with you",
        "I should probably say the thing I meant while listing every detail of the argument in a paragraph",
        "There is a feeling I have been meaning to discuss at length with you"
      ]
    }),
    { hookIdentity: "I should probably say the thing I meant while listing every detail of the argument in a paragraph" }
  );
  const conciseHookB = candidate("B", strongSections());
  const caseF = selectBestCandidate([
    critiqueSongCandidate(verboseHookA, dna, resolved),
    critiqueSongCandidate(conciseHookB, dna, resolved)
  ]);
  assert.equal(caseF.winnerId, "B", "CASE F: concise memorable hook wins");

  const clicheA = candidate("A", [
    {
      section: "Verse 1",
      lines: [
        "I walk through shadows, echoes, fire, and scars",
        "Broken in the darkness, I will rise from ashes",
        "The midnight train is screaming through the silence",
        "I feel the pain and find my way tonight"
      ]
    },
    {
      section: "Chorus",
      lines: [
        "Say it while the lights are on",
        "We will rise from shattered pieces",
        "Say it while the lights are on",
        "In the darkness I will rise"
      ]
    },
    {
      section: "Verse 2",
      lines: [
        "Echoes in the shadows, fire in my scars",
        "Broken pieces fading into destiny",
        "The midnight train is drowning in the night",
        "I feel the pain, I find my way"
      ]
    },
    {
      section: "Bridge",
      lines: ["Say it while the lights are on", "We will rise from shattered pieces"]
    },
    {
      section: "Final Chorus",
      lines: [
        "Say it while the lights are on",
        "We will rise from shattered pieces",
        "Say it while the lights are on",
        "Together we will find the light"
      ]
    }
  ]);
  const originalB = candidate("B", strongSections());
  const caseG = selectBestCandidate([
    critiqueSongCandidate(clicheA, dna, resolved),
    critiqueSongCandidate(originalB, dna, resolved)
  ]);
  assert.equal(caseG.winnerId, "B", "CASE G: cliché-heavy AI pattern loses");

  const tieA = candidate("A", strongSections());
  const tieB = candidate(
    "B",
    strongSections({
      verse1: [
        "I packed the midnight train inside a note",
        "The kitchen light still knows the words I wrote",
        "I count the photos face-down on the chair",
        "And tell the quiet I will meet you there"
      ]
    })
  );
  const tieCritiques = [critiqueSongCandidate(tieA, dna, resolved), critiqueSongCandidate(tieB, dna, resolved)];
  const caseH = selectBestCandidate(tieCritiques);
  assert.ok(caseH.tied || caseH.scoreDelta <= 3, "CASE H: close scores use tie-breaking rather than regenerate");
  assert.ok(caseH.winnerId === "A" || caseH.winnerId === "B", "CASE H: a winner is chosen");
  assert.equal(planRepairPass({ selected: tieCritiques[0], repairAlreadyUsed: false }).shouldRepair, false);

  const broken = critiqueSongCandidate(forbiddenA, dna, resolved);
  const repairPlan = planRepairPass({ selected: broken, repairAlreadyUsed: false });
  assert.equal(repairPlan.shouldRepair, true, "CASE I: meaningful violation triggers repair");
  assert.ok(repairPlan.targets.some((target) => target.kind === "avoid_words"));
  const secondPlan = planRepairPass({ selected: broken, repairAlreadyUsed: true });
  assert.equal(secondPlan.shouldRepair, false, "CASE I: at most one repair pass");

  const good = critiqueSongCandidate(strongA, dna, resolved);
  assert.equal(
    planRepairPass({ selected: good, repairAlreadyUsed: false }).shouldRepair,
    false,
    "CASE J: good candidates do not trigger repair"
  );

  const strategy = resolveCandidateStrategy({ SONG_ARCHITECT_CANDIDATE_MODE: "single_candidate" });
  assert.equal(strategy.mode, "single_candidate");
  assert.equal(resolveCandidateStrategy({ SONG_ARCHITECT_CANDIDATE_MODE: "multi_candidate" }).requestedCount, 2);
}

function runPhase4PronunciationAndCompilerTests() {
  const { dna, resolved } = phase4Fixture();
  const englishSections = strongSections({
    verse1: [
      "I packed the midnight train inside a note",
      "Areyto keeps the kitchen radio on",
      "I count the photos face-down on the chair",
      "And tell the quiet I will meet you there"
    ]
  });
  const englishCandidate = candidate("A", englishSections);
  const english = analyzePronunciation({
    cleanLyrics: englishCandidate.lyrics,
    sections: englishSections,
    songDNA: dna
  });
  assert.ok(
    english.adjustments.some((item) => /areyto/i.test(item.word)),
    "CASE K: unusual English-context term is handled"
  );
  assert.match(english.generationOptimizedLyrics, /Ah-RAY-toh/);
  assert.match(english.cleanLyrics, /Areyto/);
  assert.doesNotMatch(english.cleanLyrics, /Ah-RAY-toh/, "CASE O: phonetic changes never overwrite clean lyrics");

  const spanishDna = buildSongDNA(
    resolveSongArchitectInput({
      genre: "reggaeton",
      theme: "una noche en Loíza",
      angle: "te digo la verdad",
      emotion: "nostalgic",
      hookIdentity: "Quédate en la noche",
      language: "Spanish",
      structure: "Verse 1 > Chorus > Verse 2 > Bridge > Final Chorus",
      mustInclude: ["corazón"],
      avoidWords: []
    }).resolved
  );
  const spanishSections = [
    { section: "Verse 1", lines: ["El corazón me late en la calle", "La noche guarda tu nombre"] },
    { section: "Chorus", lines: ["Quédate en la noche", "No apagues la radio"] },
    { section: "Verse 2", lines: ["El amor se queda en la casa", "La vida sigue en la lluvia"] },
    { section: "Bridge", lines: ["Si el cielo calla, yo te llamo"] },
    { section: "Final Chorus", lines: ["Quédate en la noche", "El corazón no miente"] }
  ];
  const spanish = analyzePronunciation({
    cleanLyrics: spanishSections.map((section) => [`[${section.section}]`, ...section.lines].join("\n")).join("\n"),
    sections: spanishSections,
    songDNA: spanishDna
  });
  assert.equal(
    spanish.adjustments.some((item) => /coraz[oó]n|noche|amor|vida/i.test(item.word)),
    false,
    "CASE L: everyday Spanish stays natural"
  );

  const bilingualDna = buildSongDNA(
    resolveSongArchitectInput({
      ...resolved,
      language: "English and Spanish"
    }).resolved
  );
  const bilingualSections = strongSections({
    verse1: [
      "I packed the midnight train inside a note",
      "Areyto on the radio, noche in the kitchen",
      "I count the photos face-down on the chair",
      "And tell the quiet I will meet you there"
    ]
  });
  const bilingual = analyzePronunciation({
    cleanLyrics: bilingualSections.map((section) => [`[${section.section}]`, ...section.lines].join("\n")).join("\n"),
    sections: bilingualSections,
    songDNA: bilingualDna
  });
  assert.ok(
    bilingual.adjustments.some((item) => /areyto/i.test(item.word)),
    "CASE M: genuinely risky token is adjusted"
  );
  assert.equal(
    bilingual.adjustments.some((item) => /noche/i.test(item.word)),
    false,
    "CASE M: common Spanish in a bilingual line is left alone"
  );

  const plain = analyzePronunciation({
    cleanLyrics: englishCandidate.lyrics.replace("Areyto keeps", "Radio keeps"),
    sections: strongSections(),
    songDNA: dna
  });
  assert.equal(plain.adjustments.length, 0, "CASE N: no unnecessary pronunciation changes");
  assert.equal(plain.cleanLyrics, plain.generationOptimizedLyrics, "CASE N: clean equals optimized");

  const optimized = "Say it while the lights are on\nAh-RAY-toh on the radio";
  const clean = "Say it while the lights are on\nAreyto on the radio";
  const normalized = normalizeSongArchitectOutput({
    rawOutputText: JSON.stringify({
      concept: {
        theme: resolved.theme,
        angle: resolved.angle,
        emotion: resolved.emotion,
        hookIdentity: resolved.hookIdentity,
        tensionWords: ["truth", "light"],
        structure: resolved.structure,
        energyCurve: resolved.energyCurve
      },
      lyricsSections: [
        { section: "Verse 1", lines: ["Areyto on the radio"] },
        { section: "Chorus", lines: ["Say it while the lights are on"] }
      ],
      performanceNotes: ["Keep verses dry"],
      altHooks: ["Say it while the lights are on"],
      exportPrompt: "IGNORE ME"
    }),
    model: "test-model",
    generatedAt: "2026-08-16T00:00:00.000Z",
    resolvedInput: resolved,
    generationOptimizedLyrics: optimized,
    selection: {
      whyThisVersion: ["stronger hook"],
      pronunciationAdjustments: [{ word: "Areyto", pronunciation: "Ah-RAY-toh" }]
    }
  });
  assert.equal(normalized.lyrics.includes("Areyto"), true, "CASE P: human-facing lyrics stay clean");
  assert.doesNotMatch(normalized.lyrics, /Ah-RAY-toh/);
  assert.match(normalized.exportPrompt, /Ah-RAY-toh/, "CASE P: export uses optimized lyrics");
  assert.match(normalized.exportPrompt, /STYLE/);
  assert.match(normalized.exportPrompt, /BLUEPRINT/);
  assert.equal(normalized.generationOptimizedLyrics, optimized);
  assert.equal(compileSunoExportPrompt(normalized.songDNA, { lyrics: optimized, concept: normalized.concept }).includes(clean), false);

  const repaired = candidate("A", strongSections());
  const phase4 = runSongArchitectPhase4({
    songDNA: dna,
    resolvedInput: resolved,
    candidates: [candidate("A", strongSections({ verse1: ["Baby I packed the midnight train inside a note", "Line two", "Line three", "Line four"] }))],
    candidateMode: "single_candidate"
  });
  assert.equal(phase4.repairRecommended, true);
  const afterRepair = applyRepairedCandidate(phase4, repaired, { songDNA: dna, resolvedInput: resolved });
  assert.equal(afterRepair.observability.repaired, true);
  assert.equal(afterRepair.repairRecommended, false);
  assert.equal(afterRepair.selected.lyrics.includes("Baby"), false);
}

function denseInput(genre, extras = {}) {
  return {
    genre,
    theme: "a public fall and the night that follows",
    angle: "I tell you the truth I hid",
    emotion: "dark, emotional, powerful, bitter but hopeful",
    hookIdentity: "Say it while the lights are on",
    structure: extras.structure ?? "Intro > Verse 1 > Pre-Chorus > Chorus > Verse 2 > Bridge > Final Chorus",
    energyCurve:
      extras.energyCurve ??
      "quiet confession, filtered lift, high-impact payoff, contrast cut, then the biggest final return",
    language: extras.language ?? "English",
    vocalStyle: extras.vocalStyle ?? "aggressive baritone with stacked hook shouts",
    lineDensity: "dense",
    referenceArtists: extras.referenceArtists ?? ["The Weeknd", "Metallica"],
    mustInclude: extras.mustInclude ?? ["midnight train"],
    avoidWords: extras.avoidWords ?? ["baby"],
    userNotes: extras.userNotes ?? "keep the verses dry and close, explode the chorus, no festival EDM language",
    sonicControls: {
      bpm: extras.bpm ?? 96,
      groove: extras.groove ?? "half-time crush with a lift",
      instrumentFocus: extras.instrumentFocus ?? "downtuned guitars",
      productionEra: extras.productionEra ?? "late-90s/2000s revival",
      productionTexture: extras.productionTexture ?? "high guitar saturation"
    },
    ...extras.input
  };
}

function sectionBodies(blueprint) {
  return [...blueprint.matchAll(/\[([^\]]+)\]\n([^\[]*)/g)].map((match) => ({
    label: match[1],
    body: match[2].trim()
  }));
}

function runPhase5CompilerArchitectureTests() {
  const simple = dnaFor({
    genre: "pop",
    emotion: "hopeful",
    vocalStyle: "breathy, intimate",
    energyCurve: "quiet confession into open chorus",
    structure: "Verse 1 > Chorus > Verse 2 > Final Chorus"
  }).dna;
  const simplePkg = compileGenerationPackage(simple, { provider: "suno" }, { lyrics: "hello" });
  assert.match(simplePkg.stylePrompt, /pop|vocal|intimate|chorus/i, "CASE A: simple style keeps useful identity");
  assert.match(simplePkg.blueprint, /\[Verse 1\]/);
  assert.match(simplePkg.blueprint, /\[Chorus\]/);
  assert.ok(simplePkg.stylePrompt.length <= PROMPT_BUDGETS.default.stylePromptChars + 40, "CASE A: simple stays near budget");

  const denseEdm = dnaFor(
    denseInput("EDM", {
      vocalStyle: "anthemic topline",
      groove: "four-on-the-floor lift",
      instrumentFocus: "lead synth",
      bpm: 128,
      productionTexture: "sidechained club punch",
      productionEra: "modern festival-adjacent",
      energyCurve: "filter-build into a high-impact drop",
      structure: "Intro > Verse 1 > Build > Drop > Breakdown > Final Drop",
      referenceArtists: ["The Weeknd", "Billie Eilish"]
    })
  ).dna;
  const denseDefault = compileGenerationPackage(denseEdm, { provider: "suno", strategy: "default" }, { lyrics: "drop" });
  assert.ok(denseDefault.stylePrompt.length <= PROMPT_BUDGETS.default.stylePromptChars + 2, "CASE B: dense style stays in budget");
  assert.ok(denseDefault.blueprint.length <= PROMPT_BUDGETS.default.totalBlueprintChars + 40, "CASE B: dense blueprint stays in budget");
  assert.match(denseDefault.stylePrompt, /edm|synth|128|four-on-the-floor|topline/i);

  const explicitVsInferred = selectBudgetedInstructions(
    [
      { text: "aggressive baritone", weight: 90, bucket: "vocal", source: "explicit_user" },
      { text: "downtuned guitars", weight: 85, bucket: "instrumentation", source: "sonic_control" },
      { text: "optional whispered falsetto stacks", weight: 50, bucket: "texture", source: "reference_optional" },
      { text: "secondary analog pad wash", weight: 48, bucket: "texture", source: "reference_optional" },
      { text: "cinematic ambience bed", weight: 45, bucket: "texture", source: "inferred" }
    ],
    { maxInstructions: 2, maxChars: 70 }
  );
  assert.ok(explicitVsInferred.selected.some((item) => /baritone|downtuned/i.test(item)), "CASE C: explicit survives");
  assert.equal(
    explicitVsInferred.selected.some((item) => /falsetto|pad wash|cinematic ambience/i.test(item)),
    false,
    "CASE C: optional inferred trait is dropped"
  );

  const metal = dnaFor(
    denseInput("nu-metal", {
      vocalStyle: "aggressive, gritty",
      structure: "Verse 1 > Chorus > Verse 2 > Bridge > Final Chorus"
    })
  ).dna;
  const metalPkg = compileGenerationPackage(metal, { provider: "suno" }, { lyrics: "crush" });
  const metalSections = sectionBodies(metalPkg.blueprint);
  assert.ok(metalSections.length >= 3, "CASE D: multiple sections compiled");
  const globalHits = metalSections.filter((section) => /nu-metal|downtuned guitars|aggressive, gritty/i.test(section.body));
  assert.ok(globalHits.length < metalSections.length, "CASE D: global identity is not restated in every section");

  const verse = metalSections.find((section) => /verse 1/i.test(section.label));
  const chorus = metalSections.find((section) => /^chorus$/i.test(section.label));
  assert.ok(verse && chorus, "CASE E: verse and chorus exist");
  assert.notEqual(verse.body.toLowerCase(), chorus.body.toLowerCase(), "CASE E: sections communicate change");
  assert.doesNotMatch(verse.body, /nu-metal, downtuned guitars, aggressive/i);

  const metalStyle = metalPkg.stylePrompt;
  assert.match(metalStyle, /nu-metal|guitar|half-time|baritone|aggressive/i, "CASE F: positive identity remains");
  const avoidIndex = metalStyle.toLowerCase().indexOf("avoid");
  if (avoidIndex !== -1) {
    assert.ok(avoidIndex > 20, "CASE F: exclusions stay after positive identity");
  }

  const { resolved, dna } = phase4Fixture();
  const bilingualSections = [
    { section: "Verse 1", lines: ["Areyto on the radio", "I packed the midnight train"] },
    { section: "Chorus", lines: ["Say it while the lights are on"] }
  ];
  const pronunciation = analyzePronunciation({
    cleanLyrics: bilingualSections.map((section) => [`[${section.section}]`, ...section.lines].join("\n")).join("\n"),
    sections: bilingualSections,
    songDNA: buildSongDNA(resolveSongArchitectInput({ ...resolved, language: "English and Spanish" }).resolved)
  });
  const pronounced = compileGenerationPackage(dna, { provider: "suno" }, {
    cleanLyrics: pronunciation.cleanLyrics,
    lyrics: pronunciation.generationOptimizedLyrics,
    pronunciationAdjustments: pronunciation.adjustments
  });
  assert.match(pronounced.generationLyrics, /Ah-RAY-toh/, "CASE G: targeted phonetics remain");
  assert.match(pronounced.cleanLyrics, /Areyto/, "CASE G: clean lyrics stay readable");
  assert.doesNotMatch(pronounced.generationLyrics, /Areyto \(Ah-RAY-toh\)/, "CASE G: no parenthetical annotation noise");

  const noisyAdjustments = [
    { word: "Areyto", pronunciation: "Ah-RAY-toh", reason: "known", source: "auto" },
    { word: "Coqui", pronunciation: "ko-KEE", reason: "known", source: "override" },
    { word: "Alpha", pronunciation: "AL-fah", reason: "name", source: "auto" },
    { word: "Bravo", pronunciation: "BRAH-vo", reason: "name", source: "auto" },
    { word: "Charlie", pronunciation: "CHAR-lee", reason: "name", source: "auto" },
    { word: "Delta", pronunciation: "DEL-tah", reason: "name", source: "auto" },
    { word: "Echo", pronunciation: "EH-ko", reason: "name", source: "auto" },
    { word: "Foxtrot", pronunciation: "FOKS-trot", reason: "name", source: "auto" },
    { word: "Golf", pronunciation: "GAHLF", reason: "name", source: "auto" },
    { word: "Hotel", pronunciation: "ho-TEL", reason: "name", source: "auto" }
  ];
  const budgeted = budgetPronunciationAdjustments(noisyAdjustments, PROMPT_BUDGETS.default.pronunciationAnnotations);
  assert.ok(budgeted.length <= PROMPT_BUDGETS.default.pronunciationAnnotations, "CASE H: annotation count is capped");
  assert.ok(budgeted.some((item) => item.word === "Coqui"), "CASE H: override survives");
  assert.ok(budgeted.some((item) => item.word === "Areyto"), "CASE H: high-risk known term survives");
  const noisyPkg = compileGenerationPackage(dna, { provider: "suno" }, {
    cleanLyrics: "Areyto Coqui Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel",
    pronunciationAdjustments: noisyAdjustments
  });
  assert.doesNotMatch(noisyPkg.generationLyrics, /\([A-Z]{2}/, "CASE H: no parenthetical phonetic dump");
  assert.ok(noisyPkg.generationLyrics.split(" ").length <= 12, "CASE H: lyrics stay compact");

  const defaultSuno = compileGenerationPackage(simple, { provider: "suno" }, { lyrics: "hello", concept: {
    theme: simple.composition.theme,
    hookIdentity: simple.composition.hookIdentity,
    structure: simple.composition.structure
  }});
  assert.match(defaultSuno.exportPrompt, /STYLE/);
  assert.match(defaultSuno.exportPrompt, /BLUEPRINT/);
  assert.match(defaultSuno.exportPrompt, /LYRICS/);
  assert.equal(compileSunoStylePrompt(simple), defaultSuno.stylePrompt, "CASE I: default wrapper matches package");

  const concise = compileGenerationPackage(denseEdm, { provider: "suno", strategy: "concise" }, { lyrics: "drop" });
  assert.ok(concise.stylePrompt.length > 0 && concise.blueprint.length > 0, "CASE J: alternate strategy is valid");
  assert.ok(concise.stylePrompt.length <= PROMPT_BUDGETS.concise.stylePromptChars);
  assert.equal(concise.diagnostics.strategy, "concise");

  const unknownVersion = compileGenerationPackage(simple, { provider: "suno", version: "not-a-real-version" }, { lyrics: "hello" });
  assert.equal(unknownVersion.diagnostics.strategy, "default", "CASE K: unknown version falls back");
  assert.match(unknownVersion.stylePrompt, /pop|vocal/i);

  const unknownProvider = resolveGenerationTarget({ provider: "made-up-engine" });
  assert.equal(unknownProvider.provider, "generic");
  assert.equal(unknownProvider.unknownTarget, true);
  const unknownPkg = compileGenerationPackage(simple, { provider: "made-up-engine" }, { lyrics: "hello" });
  assert.equal(unknownPkg.target.provider, "generic", "CASE L: unknown provider uses generic fallback");
  assert.match(unknownPkg.exportPrompt, /STYLE BRIEF|STYLE/);

  const genericPkg = compileGenerationPackage(metal, { provider: "generic" }, { lyrics: "crush" });
  assert.match(genericPkg.exportPrompt, /STYLE BRIEF/, "CASE M: generic uses model-independent labels");
  assert.match(genericPkg.exportPrompt, /PRODUCTION BLUEPRINT/);
  assert.match(genericPkg.stylePrompt, /nu-metal|guitar|half-time/i);
  assert.doesNotMatch(genericPkg.exportPrompt, /udio custom mode|udio tags/i);

  const forced = compileGenerationPackage(simple, { provider: "suno", strategy: "concise" }, {
    lyrics: "hello",
    forceStrategyFailure: true
  });
  assert.ok(forced.stylePrompt.length > 0 && forced.blueprint.length > 0, "CASE N: fallback produces usable output");
  assert.equal(forced.diagnostics.fallbackUsed, true);
  assert.equal(forced.diagnostics.strategy, "default");

  const diag = metalPkg.diagnostics;
  assert.ok(diag, "CASE O: diagnostics exist");
  assert.equal(typeof diag.stylePromptLength, "number");
  assert.equal(typeof diag.stylePromptWordCount, "number");
  assert.equal(typeof diag.candidateInstructionCount, "number");
  const diagJson = JSON.stringify(diag);
  assert.doesNotMatch(diagJson, /Say it while the lights are on|midnight train|Areyto/, "CASE O: diagnostics omit lyrics");
  assert.equal(compileGenerationPackage(metal, { provider: "suno" }, { lyrics: "crush" }).diagnostics.stylePromptLength, diag.stylePromptLength);

  assert.ok(compileSunoStylePrompt(simple).length > 0, "CASE P: style wrapper works");
  assert.ok(compileSunoBlueprint(simple).includes("[Verse 1]"), "CASE P: blueprint wrapper works");
  assert.match(compileSunoExportPrompt(simple, { lyrics: "hello" }), /STYLE[\s\S]*BLUEPRINT[\s\S]*LYRICS/);

  const page = read("app/song-architect/page.tsx");
  assert.doesNotMatch(page, /compilerDiagnostics|Generation target|Suno version/, "UI stays simple");
  assert.match(page, /Suno Blueprint/);
}

runCompositionReuseTests();
runEmotionTranslationTests();
runGenreAdaptationTests();
runOptionalFieldAndOverrideTests();
runPromptSourceOfTruthTests();
runPremiumPartitionTests();
runDetectorTests();
runSourceInvariantTests();
runNoReferenceBaselineTests();
runSingleReferenceInfluenceTests();
runCompatibleReferenceTests();
runContrastingReferenceTests();
runHarmonyGenreTests();
runSonicExclusionTests();
runLyricSonicSeparationTests();
runArtistNameIndependenceTests();
runFutureReferenceSourceTests();
runExactKeyOnlyWhenJustifiedTests();
runPhase3ArrangementAndCompilerTests();
runPhase4CriticAndSelectionTests();
runPhase4PronunciationAndCompilerTests();
runPhase5CompilerArchitectureTests();
console.log("song architect song dna tests passed");
