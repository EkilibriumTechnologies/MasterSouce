import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relPath) => readFileSync(path.join(ROOT, relPath), "utf8");

const plans = read("lib/subscriptions/plans.ts");
assert.match(plans, /creator_monthly:[\s\S]*?nativeSongGenerationsPerMonth: 0/);
assert.match(plans, /pro_studio_monthly:[\s\S]*?nativeSongGenerationsPerMonth: 20/);

const access = read("lib/music-generation/access.ts");
assert.ok(access.includes('planId === "pro_studio_monthly"'), "native generation is Pro-only");
assert.ok(access.includes('.eq("source", "lyria")'), "monthly usage counts only native Lyria generations");
assert.ok(access.includes("NATIVE_MUSIC_GENERATION_ENABLED"), "native generation is feature-flagged");

const generateRoute = read("app/api/projects/[projectId]/generate-song/route.ts");
assert.ok(generateRoute.includes("generateSongWithLyria"), "generate route calls Lyria provider");
assert.ok(generateRoute.includes("storeGeneratedSongAudio"), "generated audio is stored privately");
assert.ok(generateRoute.includes('source: "lyria"'), "native candidate is persisted as Lyria");
assert.ok(generateRoute.includes("Finish Song Architect first"), "generation requires persisted Song Architect output");

const playbackRoute = read("app/api/projects/[projectId]/generations/[generationId]/audio/route.ts");
assert.ok(playbackRoute.includes("requireAuthenticatedAccount"), "generated audio playback is authenticated");
assert.ok(playbackRoute.includes("getProjectGenerationForUser"), "audio playback verifies generation ownership");
assert.ok(playbackRoute.includes("createGeneratedSongSignedUrl"), "private audio is exposed only through a short-lived signed URL");

const projectPage = read("app/projects/[projectId]/page.tsx");
assert.ok(projectPage.includes("NativeSongGenerator"), "Journey exposes native generation");
assert.ok(projectPage.includes("Generate in Suno"), "Suno workflow remains present");
assert.ok(projectPage.includes('generation.source === "lyria"'), "Journey plays native generations");

const pricing = read("components/pricing-section.tsx");
assert.ok(pricing.includes("Generate full songs inside MasterSauce"), "pricing comparison exposes the Pro feature");

const env = read(".env.example");
for (const key of [
  "NATIVE_MUSIC_GENERATION_ENABLED",
  "GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON_BASE64",
  "GOOGLE_LYRIA_MODEL",
  "MASTERSAUCE_GENERATED_AUDIO_BUCKET"
]) {
  assert.ok(env.includes(key), `.env.example documents ${key}`);
}

console.log("native-song-generation-invariants: ok");
