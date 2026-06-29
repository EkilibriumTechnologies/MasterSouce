import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

const BASE_URL = process.env.ENCODE_AUDIT_BASE_URL?.trim() || "http://localhost:3000";
const ADMIN_EMAIL = "llarod@gmail.com";
const BILLING_HEADER = "x-mastersouce-billing-email";

function signVerifiedEmailCookie(normalizedEmail) {
  const secret =
    process.env.MASTERSAUCE_EMAIL_VERIFY_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "mastersouce-email-verify-dev-secret";
  const payload = { normalizedEmail, verifiedAt: new Date().toISOString() };
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payloadBase64).digest("base64url");
  return `ms_verified_email=${payloadBase64}.${signature}`;
}

function makeTinyMp3(workDir) {
  const out = path.join(workDir, "probe.mp3");
  const ffmpeg = ffmpegStatic;
  if (typeof ffmpeg !== "string") throw new Error("ffmpeg-static missing");
  const result = spawnSync(
    ffmpeg,
    ["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libmp3lame", "-b:a", "128k", out],
    { encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(result.stderr.slice(-500));
  return out;
}

async function postMaster(scenario, mp3Path) {
  const bytes = readFileSync(mp3Path);
  const form = new FormData();
  form.append("audio", new Blob([bytes], { type: "audio/mpeg" }), "probe.mp3");
  form.append("genre", "pop");
  form.append("loudnessMode", "balanced");
  if (scenario.billingEmailHint) {
    form.append("billingEmail", scenario.billingEmailHint);
  }

  const headers = {};
  if (scenario.billingHeader) {
    headers[BILLING_HEADER] = scenario.billingHeader;
  }
  if (scenario.cookie) {
    headers.cookie = scenario.cookie;
  }

  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/master`, {
    method: "POST",
    headers,
    body: form
  });
  const payload = await res.json().catch(() => null);
  return {
    scenario: scenario.name,
    status: res.status,
    elapsedMs: Date.now() - started,
    jobId: payload?.jobId ?? null,
    error: payload?.error ?? null
  };
}

const scenarios = [
  { name: "anonymous_no_email", billingEmailHint: null, billingHeader: null, cookie: null },
  {
    name: "hint_only_admin_email",
    billingEmailHint: ADMIN_EMAIL,
    billingHeader: null,
    cookie: null
  },
  {
    name: "cookie_header_hint_admin_email",
    billingEmailHint: ADMIN_EMAIL,
    billingHeader: ADMIN_EMAIL,
    cookie: signVerifiedEmailCookie(ADMIN_EMAIL)
  }
];

const workDir = mkdtempSync(path.join(tmpdir(), "encode-audit-"));
try {
  const mp3 = makeTinyMp3(workDir);
  console.log(JSON.stringify({ event: "encode_audit_start", baseUrl: BASE_URL, scenarios: scenarios.map((s) => s.name) }));
  for (const scenario of scenarios) {
    const result = await postMaster(scenario, mp3);
    console.log(JSON.stringify({ event: "encode_audit_result", ...result }));
  }
  console.log(
    JSON.stringify({
      event: "encode_audit_done",
      note: "Inspect server logs for admin_quality_override_attempt|applied|skipped and MASTER_DEBUG lines."
    })
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
