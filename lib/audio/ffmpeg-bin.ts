import ffmpegStatic from "ffmpeg-static";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export type FfmpegCandidateAttempt = {
  path: string;
  note: string;
};

export class FfmpegBinaryMissingError extends Error {
  readonly code = "FFMPEG_BINARY_MISSING" as const;

  constructor(
    public readonly candidatesTried: readonly FfmpegCandidateAttempt[],
    message = "No usable ffmpeg binary found. Ensure ffmpeg-static is bundled with standalone or install ffmpeg on the host."
  ) {
    super(message);
    this.name = "FfmpegBinaryMissingError";
  }
}

function isWindowsStylePath(value: string): boolean {
  return /^[a-zA-Z]:\\/.test(value) || value.includes("\\");
}

function isAbsoluteLikePath(value: string): boolean {
  return value.startsWith("/") || /^[a-zA-Z]:\\/.test(value);
}

let cachedExecutable: string | null = null;

function tryFfmpegVersion(bin: string): boolean {
  try {
    const result = spawnSync(bin, ["-hide_banner", "-version"], {
      encoding: "utf8",
      timeout: 12_000,
      stdio: ["ignore", "pipe", "pipe"]
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Returns a verified ffmpeg executable (existence for absolute paths + successful `-version`).
 * Order: FFMPEG_BIN → ffmpeg-static → /usr/bin/ffmpeg → `ffmpeg` on PATH.
 * Windows dev: set `FFMPEG_BIN` to your `ffmpeg.exe`; Netlify still ignores Windows-style FFMPEG_BIN.
 */
export function getFfmpegExecutablePath(): string {
  if (cachedExecutable) {
    return cachedExecutable;
  }

  const tried: FfmpegCandidateAttempt[] = [];
  const isNetlify = process.env.NETLIFY === "true";

  const envBin = process.env.FFMPEG_BIN?.trim();
  if (envBin) {
    if (isNetlify && isWindowsStylePath(envBin)) {
      tried.push({
        path: envBin,
        note: "skipped: Windows-style FFMPEG_BIN is ignored on Netlify (see README)"
      });
    } else if (isAbsoluteLikePath(envBin)) {
      if (!existsSync(envBin)) {
        tried.push({ path: envBin, note: "FFMPEG_BIN path does not exist (ENOENT)" });
      } else {
        const ok = tryFfmpegVersion(envBin);
        tried.push({
          path: envBin,
          note: ok ? "FFMPEG_BIN (verified with -version)" : "FFMPEG_BIN exists but -version failed"
        });
        if (ok) {
          console.info("[ffmpeg] resolved executable:", envBin);
          cachedExecutable = envBin;
          return envBin;
        }
      }
    } else {
      const ok = tryFfmpegVersion(envBin);
      tried.push({
        path: envBin,
        note: ok ? "FFMPEG_BIN command (verified with -version)" : "FFMPEG_BIN command failed or not on PATH"
      });
      if (ok) {
        console.info("[ffmpeg] resolved executable:", envBin);
        cachedExecutable = envBin;
        return envBin;
      }
    }
  }

  const packagedBin = typeof ffmpegStatic === "string" ? ffmpegStatic.trim() : "";
  if (packagedBin) {
    if (!existsSync(packagedBin)) {
      tried.push({
        path: packagedBin,
        note: "ffmpeg-static path missing from deployment (trace/bundle); file not on disk"
      });
    } else {
      const ok = tryFfmpegVersion(packagedBin);
      tried.push({
        path: packagedBin,
        note: ok ? "ffmpeg-static (verified with -version)" : "ffmpeg-static present but -version failed"
      });
      if (ok) {
        console.info("[ffmpeg] resolved executable:", packagedBin);
        cachedExecutable = packagedBin;
        return packagedBin;
      }
    }
  }

  const systemBin = "/usr/bin/ffmpeg";
  if (existsSync(systemBin)) {
    const ok = tryFfmpegVersion(systemBin);
    tried.push({
      path: systemBin,
      note: ok ? "/usr/bin/ffmpeg (verified with -version)" : "/usr/bin/ffmpeg exists but -version failed"
    });
    if (ok) {
      console.info("[ffmpeg] resolved executable:", systemBin);
      cachedExecutable = systemBin;
      return systemBin;
    }
  } else {
    tried.push({ path: systemBin, note: "not present on this host" });
  }

  const pathBin = "ffmpeg";
  const pathOk = tryFfmpegVersion(pathBin);
  tried.push({
    path: pathBin,
    note: pathOk ? "PATH ffmpeg (verified with -version)" : "ffmpeg not on PATH or -version failed"
  });
  if (pathOk) {
    console.info("[ffmpeg] resolved executable:", pathBin);
    cachedExecutable = pathBin;
    return pathBin;
  }

  throw new FfmpegBinaryMissingError(tried);
}

/** @deprecated Prefer {@link getFfmpegExecutablePath} (verifies before use). */
export function resolveFfmpegBin(): string {
  return getFfmpegExecutablePath();
}
