import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { z } from "zod";

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

/** Mirror of lib/audio/parse-adaptive-master-ai-fields.ts — keep in sync. */
function normalizeAdaptiveNotes(fields) {
  const raw =
    fields.adaptiveNotes ??
    fields.userIntent ??
    fields.user_intent ??
    fields.notes ??
    "";
  if (typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim();
  if (trimmed.length > 700) {
    return trimmed.slice(0, 700);
  }
  return trimmed;
}

/** Mirror of lib/audio/parse-adaptive-master-ai-fields.ts — keep in sync. */
function normalizeReferenceArtist(fields) {
  const raw = fields.referenceArtist;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > 120) {
    return trimmed.slice(0, 120);
  }
  return trimmed;
}

/** Mirror of app/api/master-ai/route.ts CoreBodySchema — keep in sync. */
const CoreBodySchema = z.object({
  standardMasterFileId: z.string().min(8),
  standardMasterJobId: z.string().min(4),
  preset: z.enum(["pop", "hiphop", "edm", "rock", "reggaeton", "rnb", "lofi"]).optional(),
  loudnessMode: z.enum(["clean", "balanced", "loud"]).optional()
});

function parseJsonAdaptivePreviewBody(body) {
  const fieldRecord = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const parsed = CoreBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false };
  }
  const adaptiveNotes = normalizeAdaptiveNotes(fieldRecord);
  const referenceArtist = normalizeReferenceArtist(fieldRecord);
  const userIntent = combineAdaptiveUserIntent(adaptiveNotes || undefined, referenceArtist);
  return { ok: true, adaptiveNotes, referenceArtist, userIntent };
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

function runAdaptiveFieldNormalizationTests() {
  assert.equal(normalizeAdaptiveNotes({ user_intent: "  warmer low end  " }), "warmer low end");
  assert.equal(normalizeAdaptiveNotes({ userIntent: "punchier drums" }), "punchier drums");
  assert.equal(normalizeAdaptiveNotes({ adaptiveNotes: "more air" }), "more air");
  assert.equal(normalizeAdaptiveNotes({ notes: "tighter bass" }), "tighter bass");
  assert.equal(normalizeAdaptiveNotes({ adaptiveNotes: "first", user_intent: "second" }), "first");
  assert.equal(normalizeAdaptiveNotes({}), "");
  assert.equal(normalizeAdaptiveNotes({ user_intent: 42 }), "");

  assert.equal(normalizeReferenceArtist({ referenceArtist: "  The Prodigy  " }), "The Prodigy");
  assert.equal(normalizeReferenceArtist({ referenceArtist: "" }), undefined);
  assert.equal(normalizeReferenceArtist({ referenceArtist: "   " }), undefined);
  assert.equal(normalizeReferenceArtist({}), undefined);
  assert.equal(normalizeReferenceArtist({ referenceArtist: 99 }), undefined);
}

function runJsonAdaptivePreviewPayloadTests() {
  const basePayload = {
    standardMasterFileId: "abcdefgh",
    standardMasterJobId: "job1",
    preset: "pop",
    loudnessMode: "balanced",
    billingEmail: "user@example.com"
  };

  const withUserIntent = parseJsonAdaptivePreviewBody({
    ...basePayload,
    user_intent: "warmer low end"
  });
  assert.equal(withUserIntent.ok, true, "JSON adaptive preview accepts user_intent");
  assert.equal(withUserIntent.adaptiveNotes, "warmer low end");
  assert.equal(withUserIntent.userIntent, "warmer low end");

  const withReferenceArtist = parseJsonAdaptivePreviewBody({
    ...basePayload,
    referenceArtist: "Linkin Park"
  });
  assert.equal(withReferenceArtist.ok, true, "JSON adaptive preview accepts referenceArtist");
  assert.equal(withReferenceArtist.referenceArtist, "Linkin Park");
  assert.equal(withReferenceArtist.userIntent, "Reference artist/sound: Linkin Park");

  const withBoth = parseJsonAdaptivePreviewBody({
    ...basePayload,
    user_intent: "warmer low end",
    referenceArtist: "Linkin Park"
  });
  assert.equal(withBoth.ok, true, "JSON adaptive preview accepts both fields");
  assert.equal(withBoth.userIntent, "warmer low end\nReference artist/sound: Linkin Park");

  const withEmptyReferenceArtist = parseJsonAdaptivePreviewBody({
    ...basePayload,
    user_intent: "warmer low end",
    referenceArtist: ""
  });
  assert.equal(withEmptyReferenceArtist.ok, true, "empty referenceArtist does not fail");
  assert.equal(withEmptyReferenceArtist.referenceArtist, undefined);
  assert.equal(withEmptyReferenceArtist.userIntent, "warmer low end");

  const withAdaptiveNotesAlias = parseJsonAdaptivePreviewBody({
    ...basePayload,
    adaptiveNotes: "more presence"
  });
  assert.equal(withAdaptiveNotesAlias.ok, true, "adaptiveNotes alias still works");
  assert.equal(withAdaptiveNotesAlias.userIntent, "more presence");

  const withUserIntentAlias = parseJsonAdaptivePreviewBody({
    ...basePayload,
    userIntent: "tighter kick"
  });
  assert.equal(withUserIntentAlias.ok, true, "userIntent alias still works");
  assert.equal(withUserIntentAlias.userIntent, "tighter kick");

  const withNotesAlias = parseJsonAdaptivePreviewBody({
    ...basePayload,
    notes: "smoother top end"
  });
  assert.equal(withNotesAlias.ok, true, "notes alias still works");
  assert.equal(withNotesAlias.userIntent, "smoother top end");
}

function runSourceInvariantTests() {
  const combineSource = read("lib/audio/combine-adaptive-user-intent.ts");
  assertIncludes(combineSource, "Reference artist/sound:", "combine helper formats artist guidance");

  const parseSource = read("lib/audio/parse-adaptive-master-ai-fields.ts");
  assertIncludes(parseSource, "fields.adaptiveNotes", "parse helper supports adaptiveNotes alias");
  assertIncludes(parseSource, "fields.userIntent", "parse helper supports userIntent alias");
  assertIncludes(parseSource, "fields.user_intent", "parse helper supports user_intent alias");
  assertIncludes(parseSource, "fields.notes", "parse helper supports notes alias");

  const masterAiRoute = read("app/api/master-ai/route.ts");
  assertIncludes(masterAiRoute, "normalizeAdaptiveNotes", "master-ai route normalizes adaptive notes");
  assertIncludes(masterAiRoute, "normalizeReferenceArtist", "master-ai route normalizes referenceArtist");
  assertIncludes(masterAiRoute, "combineAdaptiveUserIntent", "master-ai route combines intent");
  assertIncludes(masterAiRoute, "userIntent,", "master-ai route passes combined userIntent to pipeline");
  assertIncludes(masterAiRoute, "CoreBodySchema", "master-ai route validates core payload separately");

  const uploadForm = read("components/upload-form.tsx");
  assertIncludes(uploadForm, 'formData.append("referenceArtist"', "upload form sends referenceArtist in multipart");
  assertIncludes(uploadForm, "referenceArtist: referenceArtist.trim()", "upload form sends referenceArtist in JSON");
}

runCombineUnitTests();
runAdaptiveFieldNormalizationTests();
runJsonAdaptivePreviewPayloadTests();
runSourceInvariantTests();
console.log("adaptive-reference-artist-test: ok");
