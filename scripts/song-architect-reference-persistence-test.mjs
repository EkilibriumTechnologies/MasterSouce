/**
 * Song Architect Reference Track persistence tests — trusted-email ownership,
 * save/list/delete, dedupe, and proof that quota / Generation Match / mastering
 * stay outside this feature.
 *
 * Run:
 * node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/song-architect-reference-persistence-test.mjs
 *
 * No live Spotify, OpenAI, Stripe, or production Supabase apply required.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  normalizeReferenceStyleBlueprint,
  REFERENCE_STYLE_ANALYSIS_METADATA,
  REFERENCE_STYLE_BLUEPRINT_VERSION,
  REFERENCE_STYLE_DISCLAIMER
} from "@/lib/song-architect/reference-style-blueprint";
import {
  authorizeSavedReferenceOwnership,
  parseSaveReferencePayload,
  persistedRecordContainsSecrets,
  SAVED_REFERENCE_NOT_FOUND_MESSAGE,
  toPersistedRecordFields
} from "@/lib/song-architect/saved-reference";
import {
  deleteOwnedReference,
  listOwnedReferences,
  saveOwnedReference
} from "@/lib/song-architect/saved-reference-service";
import {
  createMemorySavedReferenceStore,
  setSavedReferenceStoreForTests
} from "@/lib/song-architect/saved-reference-store";

const ROOT = process.cwd();
const TRACK_A = "4cOdK2wGLETKBW3PvgPWqT";
const TRACK_B = "7qiZfU4dY1lWllzX7mPBI3";
const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
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

function blueprintFixture(overrides = {}) {
  const normalized = normalizeReferenceStyleBlueprint({
    source: {
      provider: "spotify",
      trackId: TRACK_A,
      title: "Blinding Lights",
      artists: ["The Weeknd"],
      album: "After Hours",
      artworkUrl: "https://i.scdn.co/image/ab",
      spotifyUrl: `https://open.spotify.com/track/${TRACK_A}`,
      ...(overrides.source ?? {})
    },
    interpretation: {
      genreDirection: ["dark cinematic electronic"],
      mood: ["nocturnal", "urgent"],
      energy: 85,
      darknessBrightness: 22,
      organicElectronicBalance: 78,
      heaviness: 40,
      rhythmicCharacter: ["tight four-on-the-floor pulse"],
      vocalCharacter: ["high, intimate stacked chorus"],
      productionPalette: ["dark synths", "punchy modern drums"],
      arrangementDirection: ["restrained atmospheric intro", "verse", "chorus"],
      likelyTempoRange: { min: 120, max: 130 },
      likelyTonalCharacter: "minor-leaning nocturnal pop",
      creativeSummary:
        "Dark cinematic electronic production with a restrained intro and a wide chorus lift.",
      ...(overrides.interpretation ?? {})
    },
    provenance: {
      analysisType: "metadata_reference_interpretation",
      directlyAnalyzedAudio: false,
      disclaimer: REFERENCE_STYLE_DISCLAIMER,
      ...(overrides.provenance ?? {})
    }
  });
  assert.ok(normalized, "fixture blueprint must normalize");
  return normalized;
}

function runIdentityTests() {
  const access = read("lib/song-architect/saved-reference-access.ts");
  const listRoute = read("app/api/song-architect/references/route.ts");
  const deleteRoute = read("app/api/song-architect/references/[id]/route.ts");

  assertIncludes(access, "resolveSongArchitectVerifiedContext", "reuses Song Architect verified context");
  assertIncludes(access, "hasTrustedEmailAccess", "requires the signed trusted-email cookie");
  assertIncludes(access, "readVerifiedEmailState", "canonical owner is the verified cookie email");
  assertIncludes(access, "email_verification_required", "unverified users are rejected");
  assertExcludes(access, "claimed.ownerEmail", "access helper does not trust client ownerEmail");
  assertExcludes(access, "getCurrentUserProfile", "does not invent a second identity system");

  assertIncludes(listRoute, "if (!owner.ok)", "unverified users cannot save or list");
  assertIncludes(listRoute, 'jsonError(owner.status, owner.code, owner.message)', "unverified save/list fail closed");
  assertBefore(
    listRoute,
    "const owner = await requireOwner(request, sessionPrep.sessionId);",
    "await saveOwnedReference({",
    "unverified user cannot save — auth runs first"
  );
  assertBefore(
    listRoute,
    "const owner = await requireOwner(request, sessionPrep.sessionId);",
    "await listOwnedReferences({ trustedEmail: owner.normalizedEmail });",
    "unverified user cannot list — auth runs first"
  );
  assertBefore(
    deleteRoute,
    "const access = await resolveSavedReferenceOwner({ request, sessionId: sessionPrep.sessionId });",
    "await deleteOwnedReference({",
    "unverified user cannot delete — auth runs first"
  );
  assertIncludes(deleteRoute, "if (!access.ok)", "unverified delete fails closed");
}

async function runPersistenceAndOwnershipTests() {
  const store = createMemorySavedReferenceStore();
  setSavedReferenceStoreForTests(store);
  const blueprintA = blueprintFixture();
  const blueprintB = blueprintFixture({
    source: { trackId: TRACK_B, title: "Shape of You", artists: ["Ed Sheeran"], album: "Divide" }
  });

  const savedA = await saveOwnedReference({
    trustedEmail: OWNER_A,
    body: { blueprint: blueprintA },
    store
  });
  assert.equal(savedA.ok, true, "verified user can save");
  if (!savedA.ok) throw new Error("expected save");
  assert.equal(savedA.reused, false);
  assert.equal(savedA.reference.analysisType, REFERENCE_STYLE_ANALYSIS_METADATA);
  assert.equal(savedA.reference.directlyAnalyzedAudio, false);
  assert.equal(savedA.reference.blueprintVersion, REFERENCE_STYLE_BLUEPRINT_VERSION);
  assert.equal("ownerEmail" in savedA.reference, false, "public payload must not include owner email");
  assert.equal(savedA.reference.blueprint.provenance.directlyAnalyzedAudio, false);

  const listedA = await listOwnedReferences({ trustedEmail: OWNER_A, store });
  assert.equal(listedA.references.length, 1);
  assert.equal(listedA.references[0].id, savedA.id);

  const listedBEmpty = await listOwnedReferences({ trustedEmail: OWNER_B, store });
  assert.equal(listedBEmpty.references.length, 0, "verified user sees only own references");

  const savedB = await saveOwnedReference({
    trustedEmail: OWNER_B,
    body: { blueprint: blueprintB },
    store
  });
  assert.equal(savedB.ok, true);
  if (!savedB.ok) throw new Error("expected second owner save");

  const listedAAfterB = await listOwnedReferences({ trustedEmail: OWNER_A, store });
  assert.equal(listedAAfterB.references.length, 1, "owner A list does not include owner B");
  assert.equal(listedAAfterB.references[0].spotifyTrackId, TRACK_A);

  const listedB = await listOwnedReferences({ trustedEmail: OWNER_B, store });
  assert.equal(listedB.references.length, 1);
  assert.equal(listedB.references[0].spotifyTrackId, TRACK_B);

  const foreignDelete = await deleteOwnedReference({
    trustedEmail: OWNER_A,
    id: savedB.id,
    store
  });
  assert.equal(foreignDelete.ok, false);
  assert.equal(foreignDelete.ok === false && foreignDelete.code, "reference_not_found");
  assert.equal(foreignDelete.ok === false && foreignDelete.message, SAVED_REFERENCE_NOT_FOUND_MESSAGE);

  const missingDelete = await deleteOwnedReference({
    trustedEmail: OWNER_A,
    id: "11111111-1111-4111-8111-111111111111",
    store
  });
  assert.equal(missingDelete.ok === false && missingDelete.message, SAVED_REFERENCE_NOT_FOUND_MESSAGE);
  assert.equal(
    foreignDelete.ok === false && missingDelete.ok === false && foreignDelete.message === missingDelete.message,
    true,
    "foreign delete must not leak whether another user's reference exists"
  );

  const stillB = await listOwnedReferences({ trustedEmail: OWNER_B, store });
  assert.equal(stillB.references.length, 1, "foreign delete must not remove owner B's reference");

  const ownedDelete = await deleteOwnedReference({ trustedEmail: OWNER_B, id: savedB.id, store });
  assert.equal(ownedDelete.ok, true);
  const listedBAfterDelete = await listOwnedReferences({ trustedEmail: OWNER_B, store });
  assert.equal(listedBAfterDelete.references.length, 0);

  setSavedReferenceStoreForTests(null);
}

async function runValidationAndDedupeTests() {
  const store = createMemorySavedReferenceStore();
  const valid = blueprintFixture();

  const malformed = parseSaveReferencePayload({ blueprint: { not: "a blueprint" } });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.ok === false && malformed.code, "malformed_blueprint");

  const empty = parseSaveReferencePayload({});
  assert.equal(empty.ok, false);

  const rejectedUserId = authorizeSavedReferenceOwnership({
    trustedEmail: OWNER_A,
    claimed: { userId: "user_123" }
  });
  assert.equal(rejectedUserId.ok === false && rejectedUserId.code, "ownership_rejected");

  const rejectedOwnerId = authorizeSavedReferenceOwnership({
    trustedEmail: OWNER_A,
    claimed: { ownerId: "acct_123" }
  });
  assert.equal(rejectedOwnerId.ok === false && rejectedOwnerId.code, "ownership_rejected");

  const mismatchedEmail = authorizeSavedReferenceOwnership({
    trustedEmail: OWNER_A,
    claimed: { ownerEmail: OWNER_B }
  });
  assert.equal(mismatchedEmail.ok === false && mismatchedEmail.code, "ownership_mismatch");

  const matchingEmailIgnored = authorizeSavedReferenceOwnership({
    trustedEmail: OWNER_A,
    claimed: { ownerEmail: OWNER_A }
  });
  assert.equal(matchingEmailIgnored.ok, true);

  const clientOwnerIgnored = await saveOwnedReference({
    trustedEmail: OWNER_A,
    body: {
      blueprint: valid,
      ownerEmail: OWNER_B,
      userId: "should-not-work"
    },
    store
  });
  assert.equal(clientOwnerIgnored.ok, false, "client userId is rejected");
  assert.equal(clientOwnerIgnored.ok === false && clientOwnerIgnored.code, "ownership_rejected");

  const clientEmailMismatch = await saveOwnedReference({
    trustedEmail: OWNER_A,
    body: {
      blueprint: valid,
      ownerEmail: OWNER_B
    },
    store
  });
  assert.equal(clientEmailMismatch.ok, false);
  assert.equal(clientEmailMismatch.ok === false && clientEmailMismatch.code, "ownership_mismatch");

  const first = await saveOwnedReference({
    trustedEmail: OWNER_A,
    body: { blueprint: valid, ownerEmail: OWNER_A },
    store
  });
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("expected first save");
  assert.equal(first.reused, false);

  const updatedSummary = blueprintFixture({
    interpretation: {
      creativeSummary: "Updated original direction with brighter chorus pressure and denser low-end synths."
    }
  });
  const second = await saveOwnedReference({
    trustedEmail: OWNER_A,
    body: { blueprint: updatedSummary },
    store
  });
  assert.equal(second.ok, true);
  if (!second.ok) throw new Error("expected dedupe save");
  assert.equal(second.reused, true, "same user + track + blueprint version overwrites in place");
  assert.equal(second.id, first.id);
  assert.equal(
    second.reference.creativeSummary.includes("Updated original direction"),
    true,
    "re-save overwrites blueprint content for the same version"
  );

  const listed = await listOwnedReferences({ trustedEmail: OWNER_A, store });
  assert.equal(listed.references.length, 1, "dedupe must not create unlimited duplicates");

  const otherTrack = await saveOwnedReference({
    trustedEmail: OWNER_A,
    body: {
      blueprint: blueprintFixture({
        source: { trackId: TRACK_B, title: "Shape of You", artists: ["Ed Sheeran"] }
      })
    },
    store
  });
  assert.equal(otherTrack.ok, true);
  if (!otherTrack.ok) throw new Error("expected other track save");
  assert.equal(otherTrack.reused, false);
  const listedTwo = await listOwnedReferences({ trustedEmail: OWNER_A, store });
  assert.equal(listedTwo.references.length, 2, "different Spotify tracks are separate saved references");
}

function runSecretStrippingTests() {
  const dirty = {
    ...blueprintFixture(),
    openaiPrompt: "SECRET_SYSTEM_PROMPT",
    systemPrompt: "You are MasterSauce Song Architect's Reference Style interpreter",
    spotifyAccessToken: "tok_should_not_persist",
    source: {
      ...blueprintFixture().source,
      accessToken: "spotify-refresh-token-secret",
      clientSecret: "SPOTIFY_CLIENT_SECRET_VALUE"
    }
  };
  const fields = toPersistedRecordFields({
    trustedEmail: OWNER_A,
    blueprint: dirty
  });
  const serialized = JSON.stringify(fields);
  assert.doesNotMatch(serialized, /SECRET_SYSTEM_PROMPT/);
  assert.doesNotMatch(serialized, /tok_should_not_persist/);
  assert.doesNotMatch(serialized, /spotify-refresh-token-secret/);
  assert.doesNotMatch(serialized, /SPOTIFY_CLIENT_SECRET_VALUE/);
  assert.doesNotMatch(serialized, /You are MasterSauce Song Architect's Reference Style interpreter/);
  assert.equal(fields.ownerEmail, OWNER_A);
  assert.equal(fields.blueprint.provenance.analysisType, REFERENCE_STYLE_ANALYSIS_METADATA);
  assert.equal(fields.blueprint.provenance.directlyAnalyzedAudio, false);
  assert.equal(
    persistedRecordContainsSecrets({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
      ...fields
    }),
    false
  );
}

function runSourceInvariantTests() {
  const listRoute = read("app/api/song-architect/references/route.ts");
  const deleteRoute = read("app/api/song-architect/references/[id]/route.ts");
  const access = read("lib/song-architect/saved-reference-access.ts");
  const service = read("lib/song-architect/saved-reference-service.ts");
  const store = read("lib/song-architect/saved-reference-store.ts");
  const panel = read("components/song-architect/reference-track-panel.tsx");
  const library = read("components/song-architect/my-references-panel.tsx");
  const page = read("app/song-architect/page.tsx");
  const migration = read("supabase/migrations/20260826200000_song_architect_reference_tracks.sql");

  assertIncludes(access, "resolveSongArchitectVerifiedContext", "persistence reuses Song Architect identity");
  assertIncludes(access, "hasTrustedEmailAccess", "persistence requires the trusted email cookie");
  assertIncludes(access, "readVerifiedEmailState", "ownership comes from the verified cookie");
  assertExcludes(access, "new login", "no new login system");
  assertExcludes(access, "spotify.com/authorize", "no Spotify OAuth login");

  assertIncludes(listRoute, "resolveSavedReferenceOwner", "list/save require trusted owner");
  assertIncludes(deleteRoute, "resolveSavedReferenceOwner", "delete requires trusted owner");
  assertBefore(listRoute, "const owner = await requireOwner", "await saveOwnedReference", "auth runs before save");
  assertBefore(listRoute, "const owner = await requireOwner", "await listOwnedReferences", "auth runs before list");
  assertBefore(deleteRoute, "resolveSavedReferenceOwner", "deleteOwnedReference", "auth runs before delete");

  assertExcludes(listRoute, "recordSongArchitectGenerationEvent", "save/list do not consume Song Architect quota");
  assertExcludes(deleteRoute, "recordSongArchitectGenerationEvent", "delete does not consume Song Architect quota");
  assertExcludes(listRoute, "recordHitAnalyzerReportEvent", "save/list do not consume Analyze Your Song quota");
  assertExcludes(deleteRoute, "recordHitAnalyzerReportEvent", "delete does not consume Analyze Your Song quota");
  assertExcludes(listRoute, "@/lib/ar-ai/usage", "references API does not import analyzer usage");
  assertExcludes(service, "runGenerationMatchFromTrackAnalysis", "persistence does not call Generation Match");
  assertExcludes(service, "evaluateGenerationMatch", "persistence does not evaluate Generation Match");
  assertExcludes(store, "mastering-pipeline", "store does not master audio");
  assertExcludes(store, "adaptive-mastering", "store does not run adaptive mastering");
  assertExcludes(listRoute, "SPOTIFY_CLIENT_SECRET", "API does not persist Spotify secrets");
  assertExcludes(store, "access_token", "store does not persist Spotify tokens");
  assertExcludes(store, "buildReferenceStyleSystemPrompt", "store does not persist raw OpenAI prompts");
  assertExcludes(service, "ownerEmail: parsed", "service never stores client ownerEmail");
  assertIncludes(service, "trustedEmail: input.trustedEmail", "service persists the server-trusted email");

  assertIncludes(migration, "song_architect_reference_tracks", "migration creates the references table");
  assertIncludes(migration, "ENABLE ROW LEVEL SECURITY", "table is RLS-protected");
  assertIncludes(migration, "UNIQUE (owner_email, spotify_track_id, blueprint_version)", "dedupe unique key");
  assertIncludes(
    migration,
    "Do not apply this migration to production automatically",
    "migration warns against automatic production apply"
  );

  assertIncludes(panel, "Save Reference", "panel exposes save");
  assertIncludes(panel, "Saving...", "panel exposes saving state");
  assertIncludes(panel, "Saved", "panel exposes saved state");
  assertIncludes(panel, "/api/song-architect/references", "panel posts to save API");
  assertExcludes(panel, "ownerEmail", "panel does not send ownerEmail");
  assertIncludes(library, "My References", "library panel exists");
  assertIncludes(library, "Use Reference", "library can reuse a saved blueprint");
  assertIncludes(library, "Confirm email access", "unverified users see existing email-access action");
  assertIncludes(library, "/api/song-architect/references", "library lists via the references API");
  assertIncludes(page, "MyReferencesPanel", "Song Architect mounts My References");
  assertIncludes(page, "setReferenceBlueprint(result.blueprint)", "Use Reference attaches the persisted blueprint");
  assertExcludes(page, "genre: result.blueprint", "reuse does not auto-fill explicit form fields");
  assertExcludes(page, "password", "no username/password login added to Song Architect");
  assertExcludes(page, "spotify.com/authorize", "no Spotify OAuth login added to Song Architect");
}

runIdentityTests();
await runPersistenceAndOwnershipTests();
await runValidationAndDedupeTests();
runSecretStrippingTests();
runSourceInvariantTests();
console.log("song architect reference persistence tests passed");
