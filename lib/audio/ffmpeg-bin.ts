import ffmpegStatic from "ffmpeg-static";

function isWindowsStylePath(value: string): boolean {
  return /^[a-zA-Z]:\\/.test(value) || value.includes("\\");
}

export function resolveFfmpegBin(): string {
  const envBin = process.env.FFMPEG_BIN?.trim();
  const isNetlify = process.env.NETLIFY === "true";

  if (envBin) {
    // Avoid misconfigured Windows absolute paths in Linux production.
    if (!(isNetlify && isWindowsStylePath(envBin))) {
      return envBin;
    }
  }

  const packagedBin = typeof ffmpegStatic === "string" ? ffmpegStatic.trim() : "";
  if (packagedBin) {
    return packagedBin;
  }

  if (isNetlify || process.platform === "linux") {
    return "/usr/bin/ffmpeg";
  }

  return "ffmpeg";
}
