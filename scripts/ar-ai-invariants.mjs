import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const ROOT = process.cwd();

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
}

/** Mirror of lib/ar-ai/types.ts scorecard categories — keep in sync. */
const AR_AI_SCORECARD_CATEGORIES = [
  "Production",
  "Hook Strength",
  "Commercial Familiarity",
  "Originality",
  "Replay Value",
  "Emotional Impact",
  "Energy Curve",
  "Arrangement",
  "Streaming Readiness",
  "Playlist Fit",
  "Audience Match",
  "Release Readiness"
];

const AR_AI_DISCLAIMER =
  "This is an A&R-style competitive evaluation, not a prediction of commercial success.";

const AR_AI_LABEL_DISCUSSION_TITLE =
  "If this were submitted to a label A&R team today, what would likely be their first discussion points?";

function runRouteValidationTests() {
  const route = read("app/api/ar-ai/route.ts");
  assertIncludes(route, 'formData.get("audio")', "route reads audio from multipart form");
  assertIncludes(route, "Audio file is required.", "route rejects missing audio");
  assertIncludes(route, 'formData.get("intendedGenre")', "route parses intendedGenre");
  assertIncludes(route, 'formData.get("targetAudience")', "route parses targetAudience");
  assertIncludes(route, 'formData.get("lyrics")', "route parses lyrics");
  assertIncludes(route, 'formData.get("references")', "route parses references");
  assertIncludes(route, 'formData.get("releaseIntent")', "route parses releaseIntent");
  assertIncludes(route, "analyzeTrack", "route reuses analyzeTrack for technical metrics");
  assertIncludes(route, "technical_analysis_failed", "route fail-open on technical analysis");
  assertIncludes(route, "normalizeArAiReport", "route normalizes OpenAI output");
}

function runSchemaAndPromptTests() {
  const schema = read("lib/ar-ai/schema.ts");
  const prompts = read("lib/ar-ai/prompts.ts");
  const normalize = read("lib/ar-ai/normalize-output.ts");
  const types = read("lib/ar-ai/types.ts");

  assertIncludes(schema, "AR_AI_SCORECARD_CATEGORIES", "schema references scorecard categories");
  for (const category of AR_AI_SCORECARD_CATEGORIES) {
    assertIncludes(types, `"${category}"`, `types include scorecard category ${category}`);
  }

  assertIncludes(prompts, "Your role is NOT to predict whether a song will become a hit.", "system prompt philosophy");
  assertIncludes(prompts, "AR_AI_LABEL_DISCUSSION_TITLE", "system prompt references label discussion title");
  assertIncludes(types, AR_AI_DISCLAIMER, "types include disclaimer constant");
  assertIncludes(types, AR_AI_LABEL_DISCUSSION_TITLE, "types include label discussion title");
  assertIncludes(normalize, "disclaimer: AR_AI_DISCLAIMER", "normalize attaches disclaimer");
  assertIncludes(normalize, "AR_AI_LABEL_DISCUSSION_TITLE", "normalize ensures label discussion title");
}

function runUiTests() {
  const page = read("app/ar-ai/page.tsx");
  assertIncludes(page, 'type="file"', "UI renders file upload");
  assertIncludes(page, "intendedGenre", "UI renders intended genre input");
  assertIncludes(page, "targetAudience", "UI renders target audience input");
  assertIncludes(page, "lyrics", "UI renders lyrics textarea");
  assertIncludes(page, "references", "UI renders references input");
  assertIncludes(page, "releaseIntent", "UI renders release intent selector");
  assertIncludes(page, "isSubmitting", "UI handles loading state");
  assertIncludes(page, "setError", "UI handles error state");
  assertIncludes(page, "Overall A&R Rating", "UI displays overall rating");
  assertIncludes(page, "A&R Scorecard", "UI displays scorecard");
  assertIncludes(page, "MasterSauce A&R AI", "UI headline");
  assertIncludes(page, "does not predict hits", "UI subheadline disclaimer");
}

function runIsolationTests() {
  const route = read("app/api/ar-ai/route.ts");
  const masterAi = read("app/api/master-ai/route.ts");

  assert.ok(!masterAi.includes("ar-ai"), "master-ai route must not reference ar-ai");
  assert.ok(!route.includes("adaptiveMastering"), "ar-ai route must not invoke adaptive mastering");
  assert.ok(!route.includes("getEntitlementsForUser"), "ar-ai route must not touch billing entitlements");
}

function run() {
  runRouteValidationTests();
  runSchemaAndPromptTests();
  runUiTests();
  runIsolationTests();
  console.log("ar-ai invariants passed");
}

run();
