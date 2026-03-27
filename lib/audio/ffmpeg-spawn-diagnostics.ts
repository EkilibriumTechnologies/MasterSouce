import { spawn } from "node:child_process";

function clip(text: string, limit: number): string {
  const t = text.trim();
  return t.length > limit ? `${t.slice(0, limit)}…` : t;
}

export type FfmpegAsyncProbeResult = {
  spawnError: string | null;
  exitCode: number | null;
  stdoutSummary: string | null;
  stderrSummary: string | null;
  timedOut: boolean;
};

/**
 * Async spawn check for logging (resolution already uses spawnSync -version).
 * Captures whether the Node child_process spawn path works and summaries of I/O.
 */
export function probeFfmpegSpawnVersion(bin: string, timeoutMs = 10_000): Promise<FfmpegAsyncProbeResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-hide_banner", "-version"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        spawnError: null,
        exitCode: null,
        stdoutSummary: stdout ? clip(stdout, 800) : null,
        stderrSummary: stderr ? clip(stderr, 800) : null,
        timedOut: true
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        spawnError: err.message,
        exitCode: null,
        stdoutSummary: stdout ? clip(stdout, 800) : null,
        stderrSummary: stderr ? clip(stderr, 800) : null,
        timedOut
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        spawnError: null,
        exitCode: code,
        stdoutSummary: stdout ? clip(stdout, 800) : null,
        stderrSummary: stderr ? clip(stderr, 800) : null,
        timedOut
      });
    });
  });
}
