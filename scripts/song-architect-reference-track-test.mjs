/**
 * Song Architect Reference Track tests — Spotify URL parser, metadata resolver,
 * Style Blueprint provenance, and Song Architect precedence.
 *
 * Run: node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/song-architect-reference-track-test.mjs
 *
 * No live Spotify, OpenAI, Stripe, or Supabase access required.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildSystemPrompt, buildUserPrompt } from "@/lib/song-architect/prompts";
import {
  generateReferenceStyleBlueprint,
  normalizeReferenceStyleBlueprint,
  REFERENCE_STYLE_ANALYSIS_METADATA,
  REFERENCE_STYLE_DISCLAIMER
} from "@/lib/song-architect/reference-style-blueprint";
import { resolveSongArchitectInput } from "@/lib/song-architect/resolve-input";
import { buildSongDNA } from "@/lib/song-architect/song-dna";
import {
  resetSpotifyTokenCacheForTests,
  resolveSpotifyTrackMetadata,
  SpotifyMetadataError
} from "@/lib/song-architect/spotify-metadata";
import { parseSpotifyTrackUrl } from "@/lib/song-architect/spotify-url";

const ROOT = process.cwd();
const TRACK_ID = "4cOdK2wGLETKBW3PvgPWqT";

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function blueprintFixture(overrides = {}) {
  const normalized = normalizeReferenceStyleBlueprint({
    source: {
      provider: "spotify",
      trackId: TRACK_ID,
      title: "Blinding Lights",
      artists: ["The Weeknd"],
      album: "After Hours",
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
      productionPalette: ["dark synths", "punchy modern drums", "wide chorus"],
      arrangementDirection: ["restrained atmospheric intro", "verse", "chorus", "dramatic final peak"],
      likelyTempoRange: { min: 120, max: 130 },
      likelyTonalCharacter: "minor-leaning nocturnal pop",
      creativeSummary:
        "Dark cinematic electronic production, restrained atmospheric intro, gradual tension build, dense low-end synth textures, punchy modern drums, wide melodic chorus, and a dramatic final energy peak.",
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

function runParserTests() {
  const valid = parseSpotifyTrackUrl(`https://open.spotify.com/track/${TRACK_ID}`);
  assert.equal(valid.ok, true);
  assert.equal(valid.ok && valid.trackId, TRACK_ID);

  const withQuery = parseSpotifyTrackUrl(`https://open.spotify.com/track/${TRACK_ID}?si=abc123`);
  assert.equal(withQuery.ok && withQuery.trackId, TRACK_ID);

  const intl = parseSpotifyTrackUrl(`https://open.spotify.com/intl-es/track/${TRACK_ID}`);
  assert.equal(intl.ok && intl.trackId, TRACK_ID);

  const uri = parseSpotifyTrackUrl(`spotify:track:${TRACK_ID}`);
  assert.equal(uri.ok && uri.trackId, TRACK_ID);

  const bare = parseSpotifyTrackUrl(TRACK_ID);
  assert.equal(bare.ok && bare.trackId, TRACK_ID);

  const malformed = parseSpotifyTrackUrl("not a url");
  assert.equal(malformed.ok, false);
  assert.equal(malformed.ok === false && malformed.code, "malformed_url");

  const playlist = parseSpotifyTrackUrl("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
  assert.equal(playlist.ok, false);
  assert.equal(playlist.ok === false && playlist.code, "unsupported_spotify_url");

  const album = parseSpotifyTrackUrl("https://open.spotify.com/album/4yP0hdKOZPNshxUOjY0cZj");
  assert.equal(album.ok, false);
  assert.equal(album.ok === false && album.code, "unsupported_spotify_url");

  const artist = parseSpotifyTrackUrl("https://open.spotify.com/artist/1Xyo4u8uXC1ZmMpatF05PJ");
  assert.equal(artist.ok, false);
  assert.equal(artist.ok === false && artist.code, "unsupported_spotify_url");

  const badId = parseSpotifyTrackUrl("https://open.spotify.com/track/not-a-valid-id");
  assert.equal(badId.ok, false);
  assert.equal(badId.ok === false && badId.code, "malformed_track_id");

  const shortId = parseSpotifyTrackUrl("https://open.spotify.com/track/abc");
  assert.equal(shortId.ok, false);
  assert.equal(shortId.ok === false && shortId.code, "malformed_track_id");
}

async function runMetadataResolverTests() {
  resetSpotifyTokenCacheForTests();
  const trackPayload = {
    id: TRACK_ID,
    name: "Blinding Lights",
    duration_ms: 200040,
    artists: [{ name: "The Weeknd" }],
    album: {
      name: "After Hours",
      images: [{ url: "https://i.scdn.co/image/ab", width: 300 }]
    },
    external_urls: { spotify: `https://open.spotify.com/track/${TRACK_ID}` }
  };

  const fetchImpl = async (url, init) => {
    const href = String(url);
    if (href.includes("accounts.spotify.com/api/token")) {
      assert.equal(init?.method, "POST");
      const auth = init?.headers?.Authorization ?? "";
      assert.match(String(auth), /^Basic /);
      assert.doesNotMatch(String(init?.body ?? ""), /secret-value/);
      return jsonResponse(200, { access_token: "token-1", expires_in: 3600 });
    }
    if (href.includes(`/v1/tracks/${TRACK_ID}`)) {
      return jsonResponse(200, trackPayload);
    }
    return jsonResponse(500, { error: "unexpected" });
  };

  const track = await resolveSpotifyTrackMetadata(TRACK_ID, {
    fetchImpl,
    credentials: { clientId: "id", clientSecret: "secret-value" }
  });
  assert.equal(track.id, TRACK_ID);
  assert.equal(track.title, "Blinding Lights");
  assert.deepEqual(track.artists, ["The Weeknd"]);
  assert.equal(track.album, "After Hours");
  assert.equal(track.artworkUrl, "https://i.scdn.co/image/ab");
  assert.equal(track.durationMs, 200040);

  await assert.rejects(
    () => resolveSpotifyTrackMetadata(TRACK_ID, { credentials: null, fetchImpl }),
    (error) => error instanceof SpotifyMetadataError && error.code === "missing_credentials"
  );

  resetSpotifyTokenCacheForTests();
  const notFoundFetch = async (url) => {
    const href = String(url);
    if (href.includes("accounts.spotify.com/api/token")) {
      return jsonResponse(200, { access_token: "token-2", expires_in: 3600 });
    }
    return jsonResponse(404, { error: { status: 404, message: "Not found" } });
  };
  await assert.rejects(
    () =>
      resolveSpotifyTrackMetadata(TRACK_ID, {
        fetchImpl: notFoundFetch,
        credentials: { clientId: "id", clientSecret: "secret" }
      }),
    (error) => error instanceof SpotifyMetadataError && error.code === "not_found"
  );

  resetSpotifyTokenCacheForTests();
  const authFailFetch = async () => jsonResponse(401, { error: "invalid_client" });
  await assert.rejects(
    () =>
      resolveSpotifyTrackMetadata(TRACK_ID, {
        fetchImpl: authFailFetch,
        credentials: { clientId: "id", clientSecret: "secret" }
      }),
    (error) => error instanceof SpotifyMetadataError && error.code === "auth_failed"
  );
}

function runBlueprintValidationTests() {
  const valid = blueprintFixture();
  assert.equal(valid.provenance.analysisType, REFERENCE_STYLE_ANALYSIS_METADATA);
  assert.equal(valid.provenance.directlyAnalyzedAudio, false);
  assert.equal(valid.provenance.disclaimer, REFERENCE_STYLE_DISCLAIMER);
  assert.equal(valid.interpretation.energy, 85);
  assert.deepEqual(valid.interpretation.likelyTempoRange, { min: 120, max: 130 });

  const forcedProvenance = normalizeReferenceStyleBlueprint({
    ...valid,
    provenance: {
      analysisType: "measured_audio_analysis",
      directlyAnalyzedAudio: true,
      disclaimer: "listened to the file"
    }
  });
  assert.equal(forcedProvenance?.provenance.analysisType, REFERENCE_STYLE_ANALYSIS_METADATA);
  assert.equal(forcedProvenance?.provenance.directlyAnalyzedAudio, false);

  const rounded = normalizeReferenceStyleBlueprint({
    ...valid,
    interpretation: {
      ...valid.interpretation,
      energy: 85.37,
      likelyTempoRange: { min: 126.34, max: 126.34 },
      likelyTonalCharacter: "F# minor"
    }
  });
  assert.equal(rounded?.interpretation.energy, 85);
  assert.equal(rounded?.interpretation.likelyTempoRange, null);
  assert.equal(rounded?.interpretation.likelyTonalCharacter, "minor-leaning");

  const nullable = normalizeReferenceStyleBlueprint({
    ...valid,
    interpretation: {
      ...valid.interpretation,
      energy: null,
      darknessBrightness: null,
      organicElectronicBalance: null,
      heaviness: null,
      likelyTempoRange: null,
      likelyTonalCharacter: null
    }
  });
  assert.equal(nullable?.interpretation.energy, null);
  assert.equal(nullable?.interpretation.likelyTempoRange, null);
  assert.equal(nullable?.interpretation.likelyTonalCharacter, null);

  const missingSource = normalizeReferenceStyleBlueprint({
    interpretation: valid.interpretation,
    provenance: valid.provenance
  });
  assert.equal(missingSource, null);
}

async function runBlueprintGenerationTests() {
  const track = {
    id: TRACK_ID,
    title: "Blinding Lights",
    artists: ["The Weeknd"],
    album: "After Hours",
    durationMs: 200040,
    url: `https://open.spotify.com/track/${TRACK_ID}`
  };
  const generated = await generateReferenceStyleBlueprint({
    track,
    completeJson: async () => ({
      interpretation: {
        genreDirection: ["dark cinematic electronic"],
        mood: ["nocturnal"],
        energy: 80,
        darknessBrightness: 20,
        organicElectronicBalance: 70,
        heaviness: 35,
        rhythmicCharacter: ["mid-tempo pulse"],
        vocalCharacter: ["intimate stacked hook"],
        productionPalette: ["dark synths"],
        arrangementDirection: ["intro", "chorus"],
        likelyTempoRange: { min: 118, max: 132 },
        likelyTonalCharacter: "A minor",
        creativeSummary: "Original nocturnal electronic direction with a wide chorus lift."
      }
    })
  });
  assert.equal(generated.source.title, "Blinding Lights");
  assert.equal(generated.provenance.directlyAnalyzedAudio, false);
  assert.equal(generated.interpretation.likelyTonalCharacter, "minor-leaning");
}

function runPrecedenceTests() {
  const blueprint = blueprintFixture();

  const userEnergy = resolveSongArchitectInput({
    energyCurve: "steady restrained 60",
    referenceStyleBlueprint: blueprint
  });
  assert.equal(userEnergy.resolved.energyCurve, "steady restrained 60");
  assert.notEqual(userEnergy.resolved.energyCurve.toLowerCase().includes("high-energy"), true);

  const userStructure = resolveSongArchitectInput({
    structure: "intro → verse → pre-chorus → chorus → bridge → final chorus",
    referenceStyleBlueprint: blueprint
  });
  assert.match(userStructure.resolved.structure, /intro/i);
  assert.match(userStructure.resolved.structure, /pre-chorus/i);
  assert.match(userStructure.resolved.structure, /bridge/i);

  const exclusions = resolveSongArchitectInput({
    avoidWords: ["baby", "forever"],
    mustInclude: ["midnight train"],
    referenceStyleBlueprint: blueprint
  });
  const exclusionDna = buildSongDNA(exclusions.resolved);
  assert.deepEqual(exclusionDna.composition.avoidWords, ["baby", "forever"]);
  assert.deepEqual(exclusionDna.composition.mustInclude, ["midnight train"]);

  const influenced = resolveSongArchitectInput({
    referenceStyleBlueprint: blueprint
  });
  assert.match(influenced.resolved.genre, /dark cinematic electronic/i);
  assert.match(influenced.resolved.vocalStyle, /intimate stacked chorus/i);
  const influencedDna = buildSongDNA(influenced.resolved);
  assert.equal(influencedDna.meta.referenceStyleProvenance?.analysisType, REFERENCE_STYLE_ANALYSIS_METADATA);
  assert.equal(influencedDna.meta.referenceStyleProvenance?.directlyAnalyzedAudio, false);
  assert.equal(influencedDna.sonic.bpm, undefined);
  assert.deepEqual(influencedDna.sonic.bpmRange, { min: 120, max: 130 });
  const sonicBlob = [
    influencedDna.sonic.primaryGenre,
    ...(influencedDna.sonic.subgenres ?? []),
    influencedDna.sonic.productionAesthetic,
    influencedDna.sonic.groove,
    influencedDna.reference?.influenceSummary
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  assert.match(sonicBlob, /dark|cinematic|electronic|synth|drum/);

  const userBpm = resolveSongArchitectInput({
    sonicControls: { bpm: 96 },
    referenceStyleBlueprint: blueprint
  });
  const userBpmDna = buildSongDNA(userBpm.resolved);
  assert.equal(userBpmDna.sonic.bpm, 96);

  const presetWins = resolveSongArchitectInput({
    preset: "radio-pop",
    referenceStyleBlueprint: blueprint
  });
  assert.equal(presetWins.resolved.genre, "pop");

  const { resolved, dna: namedDna } = {
    resolved: influenced.resolved,
    dna: influencedDna
  };
  const system = buildSystemPrompt(resolved, namedDna);
  const user = buildUserPrompt(resolved, namedDna);
  for (const [label, text] of [
    ["system", system],
    ["user", user]
  ]) {
    assert.doesNotMatch(text, /blinding lights/i, `${label} must not expose the reference title`);
    assert.doesNotMatch(text, /the weeknd/i, `${label} must not expose the reference artist`);
    assert.doesNotMatch(text, /clone this song|copy this song|recreate this exact/i, `${label} must not request cloning`);
  }
  assert.doesNotMatch(user, /"referenceStyleBlueprint"/);
  assert.match(system, /metadata interpretation|metadata-based interpretation/i);
}

function runSourceInvariantTests() {
  const parser = read("lib/song-architect/spotify-url.ts");
  assert.match(parser, /parseSpotifyTrackUrl/);
  const metadata = read("lib/song-architect/spotify-metadata.ts");
  assert.match(metadata, /SPOTIFY_CLIENT_ID/);
  assert.match(metadata, /client_credentials/);
  assert.doesNotMatch(metadata, /audio-analysis|audio_features/);
  const route = read("app/api/song-architect/reference-track/route.ts");
  assert.match(route, /parseSpotifyTrackUrl/);
  assert.match(route, /generateReferenceStyleBlueprint/);
  const page = read("app/song-architect/page.tsx");
  assert.match(page, /ReferenceTrackPanel/);
  const panel = read("components/song-architect/reference-track-panel.tsx");
  assert.match(panel, /Use as Song Architect Reference/);
  assert.match(panel, /Analyze Reference/);
  assert.match(panel, /REFERENCE_STYLE_DISCLAIMER/);
  const generationMatch = read("lib/song-architect/generation-match.ts");
  assert.match(generationMatch, /evaluateGenerationMatch/);
}

runParserTests();
await runMetadataResolverTests();
runBlueprintValidationTests();
await runBlueprintGenerationTests();
runPrecedenceTests();
runSourceInvariantTests();
console.log("song architect reference track tests passed");
