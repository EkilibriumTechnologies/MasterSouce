import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolveFfmpegBin } from "@/lib/audio/ffmpeg-bin";

type FfmpegRuntimeCheck = {
  resolvedPath: string;
  pathLooksAbsolute: boolean;
  binaryExists: boolean | null;
  versionCommandOk: boolean;
  exitCode: number | null;
  timedOut: boolean;
  versionOutput: string | null;
  error: string | null;
};

function isAbsoluteLikePath(value: string): boolean {
  return value.startsWith("/") || /^[a-zA-Z]:\\/.test(value);
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export async function runFfmpegRuntimeCheck(timeoutMs = 5000): Promise<FfmpegRuntimeCheck> {
  const resolvedPath = resolveFfmpegBin();
  const pathLooksAbsolute = isAbsoluteLikePath(resolvedPath);

  let binaryExists: boolean | null = null;
  if (pathLooksAbsolute) {
    try {
      await access(resolvedPath, constants.F_OK);
      binaryExists = true;
    } catch {
      binaryExists = false;
    }
  }

  const result = await new Promise<{
    ok: boolean;
    exitCode: number | null;
    timedOut: boolean;
    output: string | null;
    error: string | null;
  }>((resolve) => {
    const child = spawn(resolvedPath, ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let resolved = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        timedOut,
        output: null,
        error: error.message
      });
    });
    child.on("close", (exitCode) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const merged = `${stdout}\n${stderr}`.trim();
      resolve({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        timedOut,
        output: merged ? clip(merged, 1200) : null,
        error: exitCode === 0 && !timedOut ? null : `ffmpeg -version exited with code ${String(exitCode)}`
      });
    });
  });

  return {
    resolvedPath,
    pathLooksAbsolute,
    binaryExists,
    versionCommandOk: result.ok,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    versionOutput: result.output,
    error: result.error
  };
}
