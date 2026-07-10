import assert from "node:assert/strict";

import {
  getJobExportVerifyRecord,
  markJobExportCodecVerified,
  recordJobExportEncodeResolution
} from "@/lib/jobs/job-export-verify";

async function runOwnerMetadataTest() {
  const jobId = `adaptive_meta_owner_${Date.now()}`;
  await recordJobExportEncodeResolution({
    endpoint: "/api/master-ai",
    jobId,
    planId: "pro_studio_monthly",
    outputQuality: "32bit_float",
    outputCodec: "pcm_f32le",
    emailSource: "owner_bypass",
    normalizedEmail: "llarod@gmail.com",
    adminOverrideGranted: true
  });

  let record = await getJobExportVerifyRecord(jobId);
  assert.ok(record, "owner encode metadata is persisted");
  assert.equal(record.outputQuality, "32bit_float", "owner quality persisted before render");
  assert.equal(record.outputCodec, "pcm_f32le", "owner codec persisted before render");
  assert.equal(record.emailSource, "owner_bypass", "trusted identity source persisted");
  assert.equal(record.trustedIdentitySource, "owner_bypass", "trusted identity source mirrored");
  assert.equal(record.adminOverrideGranted, true, "admin override state persisted");

  await markJobExportCodecVerified(jobId, "pcm_f32le");
  record = await getJobExportVerifyRecord(jobId);
  assert.equal(record?.codecVerifiedAfterExport, "pcm_f32le", "owner verified codec persisted");
  assert.equal(record?.outputQuality, "32bit_float", "verification preserves owner quality");
  assert.equal(record?.outputCodec, "pcm_f32le", "verification preserves owner codec");
}

async function runLateFinalizeMetadataTest() {
  const jobId = `adaptive_meta_late_${Date.now()}`;
  await recordJobExportEncodeResolution({
    endpoint: "/api/master-ai",
    jobId,
    planId: "free",
    outputQuality: "16bit",
    outputCodec: "pcm_s16le",
    emailSource: "verified_cookie",
    normalizedEmail: "free@example.com",
    adminOverrideGranted: false
  });

  await markJobExportCodecVerified(jobId, "pcm_f32le", "32bit_float");
  const record = await getJobExportVerifyRecord(jobId);
  assert.equal(record?.outputQuality, "32bit_float", "late delivery upgrade updates persisted quality");
  assert.equal(record?.outputCodec, "pcm_f32le", "late delivery upgrade updates persisted codec");
  assert.equal(record?.codecVerifiedAfterExport, "pcm_f32le", "late delivery upgrade verifies final codec");
}

await runOwnerMetadataTest();
await runLateFinalizeMetadataTest();
console.log("job export verify tests passed");
