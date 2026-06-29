import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

const ADMIN_EMAIL = "llarod@gmail.com";
const workDir = mkdtempSync(path.join(tmpdir(), "hint-only-"));
try {
  const out = path.join(workDir, "probe.mp3");
  spawnSync(ffmpegStatic, ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libmp3lame", "-b:a", "128k", out], {
    stdio: "ignore"
  });
  const form = new FormData();
  form.append("audio", new Blob([readFileSync(out)], { type: "audio/mpeg" }), "probe.mp3");
  form.append("genre", "pop");
  form.append("loudnessMode", "balanced");
  form.append("billingEmail", ADMIN_EMAIL);
  const res = await fetch("http://localhost:3000/api/master", { method: "POST", body: form });
  const payload = await res.json().catch(() => null);
  console.log(JSON.stringify({ scenario: "hint_only_admin_email", status: res.status, jobId: payload?.jobId ?? null }));
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
