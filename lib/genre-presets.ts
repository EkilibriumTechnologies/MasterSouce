export type EqBand = {
  freq: number;
  gain: number;
  type?: "highpass" | "peaking";
};

export type LoudnessModeTargets = {
  lufsTarget: number;
  truePeak: number;
};

export type GenrePreset = {
  label: string;
  lufsTarget: number;
  truePeak: number;
  loudnessModes: {
    clean: LoudnessModeTargets;
    balanced: LoudnessModeTargets;
    loud: LoudnessModeTargets;
  };
  compression: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  };
  eq: EqBand[];
  limiter: {
    ceiling: number;
    lookahead: number;
    release: number;
    targetLUFS: number;
    maxGR: number;
  };
  saturation: boolean;
};

export const GENRE_PRESETS: Record<string, GenrePreset> = {
  pop: {
    label: "Pop",
    lufsTarget: -10,
    truePeak: -1.0,
    loudnessModes: {
      clean: { lufsTarget: -14, truePeak: -1.5 },
      balanced: { lufsTarget: -10, truePeak: -1.0 },
      loud: { lufsTarget: -8, truePeak: -0.5 }
    },
    compression: { threshold: -18, ratio: 2, attack: 30, release: 150 },
    eq: [
      { freq: 80, gain: -2, type: "highpass" },
      { freq: 150, gain: 1.5 },
      { freq: 3000, gain: 1.5 },
      { freq: 10000, gain: 2 }
    ],
    limiter: { ceiling: -1.0, lookahead: 5, release: 50, targetLUFS: -10, maxGR: 2 },
    saturation: false
  },
  hiphop: {
    label: "Hip-Hop / Trap",
    lufsTarget: -9,
    truePeak: -0.5,
    loudnessModes: {
      clean: { lufsTarget: -13, truePeak: -1.0 },
      balanced: { lufsTarget: -9, truePeak: -0.5 },
      loud: { lufsTarget: -7, truePeak: -0.3 }
    },
    compression: { threshold: -14, ratio: 4, attack: 60, release: 80 },
    eq: [
      { freq: 60, gain: 3 },
      { freq: 80, gain: 2 },
      { freq: 2000, gain: 1.5 },
      { freq: 12000, gain: 2 }
    ],
    limiter: { ceiling: -0.5, lookahead: 5, release: 40, targetLUFS: -9, maxGR: 4 },
    saturation: true
  },
  edm: {
    label: "EDM / Electronic",
    lufsTarget: -9,
    truePeak: -0.3,
    loudnessModes: {
      clean: { lufsTarget: -13, truePeak: -1.0 },
      balanced: { lufsTarget: -9, truePeak: -0.3 },
      loud: { lufsTarget: -7, truePeak: -0.2 }
    },
    compression: { threshold: -12, ratio: 5, attack: 10, release: 60 },
    eq: [
      { freq: 50, gain: 3 },
      { freq: 100, gain: 2 },
      { freq: 500, gain: -1.5 },
      { freq: 8000, gain: 2.5 }
    ],
    limiter: { ceiling: -0.3, lookahead: 3, release: 35, targetLUFS: -9, maxGR: 4 },
    saturation: true
  },
  rock: {
    label: "Rock",
    lufsTarget: -11,
    truePeak: -1.0,
    loudnessModes: {
      clean: { lufsTarget: -14, truePeak: -1.5 },
      balanced: { lufsTarget: -11, truePeak: -1.0 },
      loud: { lufsTarget: -9, truePeak: -0.5 }
    },
    compression: { threshold: -16, ratio: 3, attack: 20, release: 100 },
    eq: [
      { freq: 80, gain: 2 },
      { freq: 400, gain: -2 },
      { freq: 5000, gain: 2 },
      { freq: 10000, gain: 2.5 }
    ],
    limiter: { ceiling: -1.0, lookahead: 5, release: 45, targetLUFS: -11, maxGR: 3 },
    saturation: true
  },
  reggaeton: {
    label: "Reggaeton / Latin",
    lufsTarget: -9,
    truePeak: -0.5,
    loudnessModes: {
      clean: { lufsTarget: -13, truePeak: -1.0 },
      balanced: { lufsTarget: -9, truePeak: -0.5 },
      loud: { lufsTarget: -7, truePeak: -0.3 }
    },
    compression: { threshold: -13, ratio: 4.5, attack: 15, release: 70 },
    eq: [
      { freq: 50, gain: 3.5 },
      { freq: 200, gain: 2 },
      { freq: 400, gain: -2 },
      { freq: 3000, gain: 2 }
    ],
    limiter: { ceiling: -0.5, lookahead: 4, release: 40, targetLUFS: -9, maxGR: 4 },
    saturation: true
  },
  rnb: {
    label: "R&B / Soul",
    lufsTarget: -12,
    truePeak: -1.0,
    loudnessModes: {
      clean: { lufsTarget: -14, truePeak: -1.5 },
      balanced: { lufsTarget: -12, truePeak: -1.0 },
      loud: { lufsTarget: -9, truePeak: -0.5 }
    },
    compression: { threshold: -18, ratio: 2.5, attack: 40, release: 200 },
    eq: [
      { freq: 100, gain: 1.5 },
      { freq: 300, gain: 1.5 },
      { freq: 2500, gain: 1.5 },
      { freq: 6000, gain: -1 }
    ],
    limiter: { ceiling: -1.0, lookahead: 5, release: 60, targetLUFS: -12, maxGR: 2 },
    saturation: true
  },
  lofi: {
    label: "Lo-Fi / Ambient",
    lufsTarget: -15,
    truePeak: -1.5,
    loudnessModes: {
      clean: { lufsTarget: -18, truePeak: -2.0 },
      balanced: { lufsTarget: -15, truePeak: -1.5 },
      loud: { lufsTarget: -12, truePeak: -1.0 }
    },
    compression: { threshold: -24, ratio: 1.5, attack: 80, release: 300 },
    eq: [
      { freq: 60, gain: -3, type: "highpass" },
      { freq: 200, gain: 2 },
      { freq: 8000, gain: -4 }
    ],
    limiter: { ceiling: -1.5, lookahead: 8, release: 80, targetLUFS: -15, maxGR: 1.5 },
    saturation: false
  }
};

export type LoudnessMode = "clean" | "balanced" | "loud";

export const LOUDNESS_MODES: Record<
  LoudnessMode,
  { label: string; lufsDelta: number; limiterDrive: number; notes: string }
> = {
  clean: {
    label: "Clean",
    lufsDelta: -4,
    limiterDrive: 0.6,
    notes: "Streaming friendly and more dynamic."
  },
  balanced: {
    label: "Balanced",
    lufsDelta: 0,
    limiterDrive: 1,
    notes: "Commercial loudness with moderate limiting."
  },
  loud: {
    label: "Loud",
    lufsDelta: 2,
    limiterDrive: 1.35,
    notes: "Aggressive loudness, use cautiously on dense mixes."
  }
};

/** Integrated LUFS target for a genre + loudness mode (authoritative; matches `loudnessModes`). */
export function getLoudnessModeLufsTarget(
  preset: GenrePreset,
  mode: LoudnessMode
): number {
  return preset.loudnessModes[mode].lufsTarget;
}

/** True-peak ceiling (dBTP) for a genre + loudness mode (authoritative; matches `loudnessModes`). */
export function getLoudnessModeTruePeak(preset: GenrePreset, mode: LoudnessMode): number {
  return preset.loudnessModes[mode].truePeak;
}
