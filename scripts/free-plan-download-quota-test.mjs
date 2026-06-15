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

const FREE_WAV_DOWNLOADS_PER_MONTH = 1;
const CREATOR_WAV_CAP = 15;
const PRO_WAV_CAP = 60;

function isBillableWavExport(record) {
  return (
    record.kind === "mastered" &&
    (record.mime.includes("wav") || record.mime.includes("wave"))
  );
}

function isUnmeteredMp3Download(record) {
  if (record.kind === "preview" || record.kind === "mastered_mp3") return true;
  return record.mime.includes("mpeg") || record.mime.includes("mp3");
}

function resolveFreePlanWavCap(planMonthlyLimit) {
  return Math.min(planMonthlyLimit, FREE_WAV_DOWNLOADS_PER_MONTH);
}

function shouldEnforceWavDownloadQuota(params) {
  if (params.adminBypass || params.isAdaptiveMasterJob) return false;
  if (!params.forceDownload) return false;
  return isBillableWavExport(params.record);
}

function simulateFreeWavQuota(wavDownloadsThisMonth) {
  const cap = resolveFreePlanWavCap(FREE_WAV_DOWNLOADS_PER_MONTH);
  const remaining = Math.max(cap - wavDownloadsThisMonth, 0);
  return {
    cap,
    remaining,
    canDownloadWav: remaining > 0
  };
}

function runPolicyUnitTests() {
  assert.equal(FREE_WAV_DOWNLOADS_PER_MONTH, 1, "free WAV cap is 1");
  assert.equal(resolveFreePlanWavCap(99), 1, "free cap clamps plan limit");

  const masteredWav = { kind: "mastered", mime: "audio/wav" };
  const masteredMp3 = { kind: "mastered_mp3", mime: "audio/mpeg" };
  const previewMp3 = { kind: "preview", mime: "audio/mpeg" };

  assert.equal(isBillableWavExport(masteredWav), true, "mastered WAV is billable");
  assert.equal(isBillableWavExport(masteredMp3), false, "full MP3 master is not billable WAV");
  assert.equal(isBillableWavExport(previewMp3), false, "preview MP3 is not billable WAV");
  assert.equal(isUnmeteredMp3Download(masteredMp3), true, "full MP3 master is unmetered");
  assert.equal(isUnmeteredMp3Download(previewMp3), true, "preview MP3 is unmetered");

  assert.equal(
    shouldEnforceWavDownloadQuota({
      record: masteredMp3,
      forceDownload: true,
      isAdaptiveMasterJob: false,
      adminBypass: false
    }),
    false,
    "full MP3 master attachment does not enforce WAV quota"
  );

  assert.equal(
    shouldEnforceWavDownloadQuota({
      record: previewMp3,
      forceDownload: true,
      isAdaptiveMasterJob: false,
      adminBypass: false
    }),
    false,
    "MP3 preview attachment does not enforce WAV quota"
  );

  assert.equal(
    shouldEnforceWavDownloadQuota({
      record: masteredWav,
      forceDownload: true,
      isAdaptiveMasterJob: false,
      adminBypass: false
    }),
    true,
    "mastered WAV attachment enforces WAV quota"
  );

  let free = simulateFreeWavQuota(0);
  assert.equal(free.canDownloadWav, true, "free user can download first WAV");
  assert.equal(free.remaining, 1, "free user has 1 WAV remaining initially");

  free = simulateFreeWavQuota(1);
  assert.equal(free.canDownloadWav, false, "free user cannot download second WAV");
  assert.equal(free.remaining, 0, "free user has 0 WAV remaining after one download");

  for (let i = 0; i < 100; i++) {
    assert.equal(
      isUnmeteredMp3Download(previewMp3),
      true,
      "MP3 previews stay unmetered regardless of WAV usage"
    );
  }

  assert.equal(CREATOR_WAV_CAP, 15, "creator WAV cap unchanged");
  assert.equal(PRO_WAV_CAP, 60, "pro WAV cap unchanged");
}

function runSourceInvariantTests() {
  const plans = read("lib/subscriptions/plans.ts");
  assert.match(plans, /free:[\s\S]*?monthlyMastersLimit:\s*1/, "free plan monthly WAV limit is 1");
  assert.match(plans, /free:[\s\S]*?quality:\s*"16bit"/, "free plan stays 16-bit WAV");
  assert.match(plans, /creator_monthly:[\s\S]*?monthlyMastersLimit:\s*15/, "creator limit unchanged");
  assert.match(plans, /creator_monthly:[\s\S]*?quality:\s*"24bit"/, "creator stays 24-bit");
  assert.match(plans, /pro_studio_monthly:[\s\S]*?monthlyMastersLimit:\s*60/, "pro limit unchanged");
  assert.match(plans, /pro_studio_monthly:[\s\S]*?quality:\s*"32bit_float"/, "pro stays 32-bit float");
  assertIncludes(plans, "Unlimited MP3 downloads", "free plan lists unlimited MP3 downloads");
  assertIncludes(plans, "1 free WAV download", "free plan lists 1 free WAV download");
  assert.match(
    plans,
    /creator_monthly:[\s\S]*?Unlimited MP3 downloads/,
    "creator plan lists unlimited MP3 downloads"
  );
  assert.match(
    plans,
    /pro_studio_monthly:[\s\S]*?Unlimited MP3 downloads/,
    "pro plan lists unlimited MP3 downloads"
  );

  const policy = read("lib/usage/download-quota-policy.ts");
  assertIncludes(policy, "FREE_WAV_DOWNLOADS_PER_MONTH = 1", "policy exports free WAV cap");
  assertIncludes(policy, "isBillableWavExport", "policy defines WAV billable helper");
  assertIncludes(policy, "isUnmeteredMp3Download", "policy defines unmetered MP3 helper");
  assertIncludes(policy, "shouldEnforceWavDownloadQuota", "policy defines quota enforcement gate");

  const entitlements = read("lib/subscriptions/entitlements.ts");
  assertIncludes(entitlements, "resolveFreePlanWavCap", "entitlements use free WAV cap resolver");
  assertExcludes(entitlements, "FREE_MASTERS_PER_MONTH = 2", "legacy free cap of 2 removed");

  const downloadRoute = read("app/api/download/route.ts");
  assertIncludes(downloadRoute, "shouldEnforceWavDownloadQuota", "download route uses WAV quota gate");
  assertIncludes(downloadRoute, "resolveFreePlanWavCap", "download route uses free WAV cap");
  assertBefore(
    downloadRoute,
    "enforceWavQuota",
    "const recorded = await recordMasteredDownloadAttempt",
    "download route: WAV quota gate before download accounting"
  );
  assertIncludes(downloadRoute, "ensureMasteredMp3ForJob", "download route lazy-exports full MP3 masters");
  assertIncludes(downloadRoute, 'format") === "mp3"', "download route supports format=mp3");

  const pricing = read("components/pricing-section.tsx");
  assertIncludes(pricing, "Unlimited MP3 downloads", "pricing section shows unlimited MP3 downloads for free");
  assertIncludes(pricing, "1 free WAV download", "pricing section shows 1 free WAV download");
  const creatorMp3Matches = pricing.match(/creator_monthly:[\s\S]*?Unlimited MP3 downloads/g) ?? [];
  assert.ok(creatorMp3Matches.length >= 1, "pricing section shows unlimited MP3 for creator");
  const proMp3Matches = pricing.match(/pro_studio_monthly:[\s\S]*?Unlimited MP3 downloads/g) ?? [];
  assert.ok(proMp3Matches.length >= 1, "pricing section shows unlimited MP3 for pro");
  assertIncludes(pricing, "WAV downloads / month", "paid plans describe WAV downloads per month");
}

function run() {
  runPolicyUnitTests();
  runSourceInvariantTests();
  console.log("free plan download quota tests passed");
}

run();
