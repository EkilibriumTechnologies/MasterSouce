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

/** Mirror of lib/audio/combine-adaptive-user-intent.ts — keep in sync. */
function combineAdaptiveUserIntent(notes, referenceArtist) {
  const trimmedNotes = notes?.trim();
  const trimmedArtist = referenceArtist?.trim();
  if (!trimmedArtist) {
    return trimmedNotes || undefined;
  }
  const artistGuidance = `Reference artist/sound: ${trimmedArtist}`;
  if (!trimmedNotes) {
    return artistGuidance;
  }
  return `${trimmedNotes}\n${artistGuidance}`;
}

function runCombineUnitTests() {
  assert.equal(combineAdaptiveUserIntent(undefined, undefined), undefined);
  assert.equal(combineAdaptiveUserIntent("", ""), undefined);
  assert.equal(combineAdaptiveUserIntent("  ", "  "), undefined);
  assert.equal(combineAdaptiveUserIntent("warmer low end", undefined), "warmer low end");
  assert.equal(combineAdaptiveUserIntent(undefined, "The Prodigy"), "Reference artist/sound: The Prodigy");
  assert.equal(
    combineAdaptiveUserIntent("warmer low end", "Linkin Park"),
    "warmer low end\nReference artist/sound: Linkin Park"
  );
  assert.equal(
    combineAdaptiveUserIntent("  punchier drums  ", "  Don Omar  "),
    "punchier drums\nReference artist/sound: Don Omar"
  );
}

function runSourceInvariantTests() {
  const combineSource = read("lib/audio/combine-adaptive-user-intent.ts");
  assertIncludes(combineSource, "Reference artist/sound:", "combine helper formats artist guidance");

  const masterAiRoute = read("app/api/master-ai/route.ts");
  assertIncludes(masterAiRoute, "referenceArtist", "master-ai route parses referenceArtist");
  assertIncludes(masterAiRoute, "combineAdaptiveUserIntent", "master-ai route combines intent");
  assertIncludes(masterAiRoute, "userIntent,", "master-ai route passes combined userIntent to pipeline");

  const uploadForm = read("components/upload-form.tsx");
  assertIncludes(uploadForm, 'formData.append("referenceArtist"', "upload form sends referenceArtist in multipart");
  assertIncludes(uploadForm, "referenceArtist: referenceArtist.trim()", "upload form sends referenceArtist in JSON");
}

runCombineUnitTests();
runSourceInvariantTests();
console.log("adaptive-reference-artist-test: ok");
