import { spawn } from "node:child_process";

export type TrackAnalysis = {
  durationSec: number | null;
  integratedLufs: number | null;
  peakDb: number | null;
  meanDb: number | null;
  crestDb: number | null;
  lowEndDb: number | null;
  lowMidDb: number | null;
  harshnessDb: number | null;
  airDb: number | null;
  alreadyLimited: boolean;
  notes: string[];
};

function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-1200)}`));
        return;
      }
      resolve(stderr);
    });
  });
}

function parseLastFloat(text: string, pattern: RegExp): number | null {
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return null;
  const value = Number(matches[matches.length - 1][1]);
  return Number.isFinite(value) ? value : null;
}

function parseDurationSeconds(text: string): number | null {
  const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return Number((hours * 3600 + minutes * 60 + seconds).toFixed(2));
}

async function measureBandDb(inputPath: string, highpass: number, lowpass: number): Promise<number | null> {
  const stderr = await runFfmpeg([
    "-hide_banner",
    "-i",
    inputPath,
    "-af",
    `highpass=f=${highpass},lowpass=f=${lowpass},volumedetect`,
    "-f",
    "null",
    "-"
  ]);
  return parseLastFloat(stderr, /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/g);
}

export async function analyzeTrack(inputPath: string): Promise<TrackAnalysis> {
  const notes: string[] = [];

  // Approximate integrated loudness using ffmpeg ebur128 output.
  const loudnessLog = await runFfmpeg([
    "-hide_banner",
    "-i",
    inputPath,
    "-filter_complex",
    "ebur128=framelog=verbose",
    "-f",
    "null",
    "-"
  ]);

  const integratedLufs = parseLastFloat(loudnessLog, /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
  const durationSec = parseDurationSeconds(loudnessLog);

  // Peak level approximation from volumedetect.
  const peakLog = await runFfmpeg(["-hide_banner", "-i", inputPath, "-af", "volumedetect", "-f", "null", "-"]);
  const peakDb = parseLastFloat(peakLog, /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/g);
  const meanDb = parseLastFloat(peakLog, /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/g);
  const crestDb =
    peakDb !== null && meanDb !== null ? Number((peakDb - meanDb).toFixed(2)) : null;

  const [lowEndDb, lowMidDb, harshnessDb, airDb] = await Promise.all([
    measureBandDb(inputPath, 20, 120),
    measureBandDb(inputPath, 200, 500),
    measureBandDb(inputPath, 3000, 8000),
    measureBandDb(inputPath, 9000, 16000)
  ]);

  const alreadyLimited =
    (integratedLufs !== null && integratedLufs > -10.5) ||
    (peakDb !== null && peakDb > -0.4) ||
    (crestDb !== null && crestDb < 6);

  if (alreadyLimited) {
    notes.push("Track appears already loud/limited; mastering intensity should be reduced.");
  }
  if (lowMidDb !== null && lowMidDb > -22) {
    notes.push("Low-mid density is elevated (possible mud).");
  }
  if (harshnessDb !== null && harshnessDb > -24) {
    notes.push("Presence band is hot; reduce potential harshness.");
  }
  if (crestDb !== null && crestDb > 14) {
    notes.push("Track is highly dynamic; avoid over-limiting.");
  }

  return {
    durationSec,
    integratedLufs,
    peakDb,
    meanDb,
    crestDb,
    lowEndDb,
    lowMidDb,
    harshnessDb,
    airDb,
    alreadyLimited,
    notes
  };
}
