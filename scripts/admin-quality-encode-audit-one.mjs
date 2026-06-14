import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

const BASE_URL = process.env.ENCODE_AUDIT_BASE_URL?.trim() || "http://localhost:3000";

function makeTinyMp3(workDir) {
  const out = path.join(workDir, "probe.mp3");
  const result = spawnSync(
    ffmpegStatic,
    ["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libmp3lame", "-b:a", "128k", out],
    { encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(result.stderr.slice(-500));
  return out;
}

const workDir = mkdtempSync(path.join(tmpdir(), "encode-audit-one-"));
try {
  const bytes = readFileSync(makeTinyMp3(workDir));
  const form = new FormData();
  form.append("audio", new Blob([bytes], { type: "audio/mpeg" }), "probe.mp3");
  form.append("genre", "pop");
  form.append("loudnessMode", "balanced");
  const res = await fetch(`${BASE_URL}/api/master`, { method: "POST", body: form });
  const payload = await res.json().catch(() => null);
  console.log(JSON.stringify({ scenario: "anonymous_no_email", status: res.status, jobId: payload?.jobId ?? null }));
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
