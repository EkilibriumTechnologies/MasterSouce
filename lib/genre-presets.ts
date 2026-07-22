export type EqBand = {
  freq: number;
  gain: number;
  type?: "highpass" | "peaking";
};

export type LoudnessModeTargets = {
  targetLufs: number;
  truePeak: number;
  compression?: {
    threshold?: number;
    ratio: number;
    attack: number;
    release: number;
  };
  limiter?: {
    ceiling: number;
    attack: number;
    release: number;
  };
};

export type GenrePreset = {
  label: string;
  /** Balanced-mode integrated LUFS (mirrors `loudnessModes.balanced.targetLufs`). */
  targetLufs: number;
  /** Balanced-mode true peak dBTP (mirrors `loudnessModes.balanced.truePeak`). */
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
  /**
   * Optional genre true-peak floor (dBTP). Pipeline takes min(mode ceiling, this value),
   * so it may only tighten — never loosen — the loudness-mode ceiling. Lo-Fi uses this
   * for quieter genre-specific ceilings when applicable.
   */
  truePeakSafetyLimiterDbTp?: number;
};

export const GENRE_PRESETS: Record<string, GenrePreset> = {
  pop: {
    label: "Pop",
    targetLufs: -10,
    truePeak: -1.0,
    loudnessModes: {
      clean: {
        targetLufs: -14,
        truePeak: -1.5,
        limiter: { ceiling: -1.5, attack: 5, release: 55 }
      },
      balanced: {
        targetLufs: -10,
        truePeak: -1.0,
        limiter: { ceiling: -1.0, attack: 5, release: 50 }
      },
      loud: {
        targetLufs: -8,
        truePeak: -0.8,
        limiter: { ceiling: -0.8, attack: 4, release: 45 }
      }
    },
    compression: { threshold: -18, ratio: 2.2, attack: 25, release: 160 },
    eq: [
      { freq: 80, gain: -2, type: "highpass" },
      { freq: 180, gain: 1.2 },
      { freq: 3200, gain: 1.4 },
      { freq: 10000, gain: 1.2 }
    ],
    limiter: { ceiling: -1.0, lookahead: 5, release: 50, targetLUFS: -10, maxGR: 2 },
    saturation: false,
    truePeakSafetyLimiterDbTp: -0.8
  },
  hiphop: {
    label: "Hip-Hop / Trap",
    targetLufs: -9,
    truePeak: -1.0,
    loudnessModes: {
      clean: {
        targetLufs: -13,
        truePeak: -1.5,
        limiter: { ceiling: -1.5, attack: 5, release: 50 }
      },
      balanced: {
        targetLufs: -9,
        truePeak: -1.0,
        limiter: { ceiling: -1.0, attack: 5, release: 45 }
      },
      loud: {
        targetLufs: -7,
        truePeak: -0.8,
        limiter: { ceiling: -0.8, attack: 4, release: 40 }
      }
    },
    // Slower attack preserves transient punch; distinct from Reggaeton's faster snap.
    compression: { threshold: -15, ratio: 3.5, attack: 45, release: 100 },
    eq: [
      { freq: 55, gain: 2.4 },
      { freq: 100, gain: 1.1 },
      { freq: 250, gain: -1.0 },
      { freq: 2500, gain: 1.6 },
      { freq: 11000, gain: 1.0 }
    ],
    limiter: { ceiling: -1.0, lookahead: 5, release: 45, targetLUFS: -9, maxGR: 3.5 },
    saturation: true,
    truePeakSafetyLimiterDbTp: -0.8
  },
  edm: {
    label: "EDM / Electronic",
    targetLufs: -9,
    truePeak: -1.0,
    loudnessModes: {
      clean: {
        targetLufs: -13,
        truePeak: -1.5,
        limiter: { ceiling: -1.5, attack: 5, release: 85 }
      },
      balanced: {
        targetLufs: -9,
        truePeak: -1.0,
        limiter: { ceiling: -1.0, attack: 5, release: 75 }
      },
      loud: {
        targetLufs: -7,
        truePeak: -0.8,
        limiter: { ceiling: -0.8, attack: 4, release: 70 }
      }
    },
    // Fast attack for club transient control; longer release than Hip-Hop.
    compression: { threshold: -13, ratio: 2.8, attack: 8, release: 90 },
    eq: [
      { freq: 45, gain: 2.4 },
      { freq: 110, gain: 1.4 },
      { freq: 450, gain: -2.0 },
      { freq: 7500, gain: 1.5 }
    ],
    limiter: { ceiling: -1.0, lookahead: 5, release: 75, targetLUFS: -9, maxGR: 3.5 },
    saturation: true,
    truePeakSafetyLimiterDbTp: -0.8
  },
  rock: {
    label: "Rock",
    targetLufs: -11,
    truePeak: -1.0,
    loudnessModes: {
      clean: {
        targetLufs: -14,
        truePeak: -1.5,
        limiter: { ceiling: -1.5, attack: 5, release: 50 }
      },
      balanced: {
        targetLufs: -11,
        truePeak: -1.0,
        limiter: { ceiling: -1.0, attack: 5, release: 45 }
      },
      loud: {
        targetLufs: -9,
        truePeak: -0.8,
        limiter: { ceiling: -0.8, attack: 4, release: 40 }
      }
    },
    compression: { threshold: -17, ratio: 2.8, attack: 18, release: 120 },
    eq: [
      { freq: 90, gain: 1.8 },
      { freq: 400, gain: -2.2 },
      { freq: 2800, gain: 1.0 },
      { freq: 5500, gain: 1.8 },
      { freq: 10000, gain: 1.0 }
    ],
    limiter: { ceiling: -1.0, lookahead: 5, release: 45, targetLUFS: -11, maxGR: 2.5 },
    saturation: true,
    truePeakSafetyLimiterDbTp: -0.8
  },
  reggaeton: {
    label: "Reggaeton / Latin",
    targetLufs: -9,
    truePeak: -1.0,
    loudnessModes: {
      clean: {
        targetLufs: -13,
        truePeak: -1.5,
        limiter: { ceiling: -1.5, attack: 4, release: 50 }
      },
      balanced: {
        targetLufs: -9,
        truePeak: -1.0,
        limiter: { ceiling: -1.0, attack: 4, release: 45 }
      },
      loud: {
        targetLufs: -7,
        truePeak: -0.8,
        limiter: { ceiling: -0.8, attack: 3, release: 40 }
      }
    },
    // Faster attack than Hip-Hop for dembow snap; mid body emphasis in EQ.
    compression: { threshold: -14, ratio: 3.2, attack: 12, release: 85 },
    eq: [
      { freq: 55, gain: 2.2 },
      { freq: 180, gain: 2.0 },
      { freq: 450, gain: -1.8 },
      { freq: 3500, gain: 1.5 },
      { freq: 9000, gain: 0.8 }
    ],
    limiter: { ceiling: -1.0, lookahead: 4, release: 45, targetLUFS: -9, maxGR: 3.5 },
    saturation: true,
    truePeakSafetyLimiterDbTp: -0.8
  },
  rnb: {
    label: "R&B / Soul",
    targetLufs: -12,
    truePeak: -1.0,
    loudnessModes: {
      clean: {
        targetLufs: -14,
        truePeak: -1.5,
        limiter: { ceiling: -1.5, attack: 6, release: 70 }
      },
      balanced: {
        targetLufs: -12,
        truePeak: -1.0,
        limiter: { ceiling: -1.0, attack: 5, release: 60 }
      },
      loud: {
        targetLufs: -9,
        truePeak: -0.8,
        limiter: { ceiling: -0.8, attack: 5, release: 55 }
      }
    },
    compression: { threshold: -19, ratio: 2.2, attack: 50, release: 220 },
    eq: [
      { freq: 90, gain: 1.8 },
      { freq: 280, gain: 1.6 },
      { freq: 2200, gain: 1.2 },
      { freq: 6500, gain: -1.2 }
    ],
    limiter: { ceiling: -1.0, lookahead: 5, release: 60, targetLUFS: -12, maxGR: 2 },
    saturation: true,
    truePeakSafetyLimiterDbTp: -0.8
  },
  lofi: {
    label: "Lo-Fi / Ambient",
    targetLufs: -15,
    truePeak: -1.5,
    loudnessModes: {
      clean: {
        targetLufs: -18,
        truePeak: -2.0,
        limiter: { ceiling: -2.0, attack: 8, release: 90 }
      },
      balanced: {
        targetLufs: -15,
        truePeak: -1.5,
        limiter: { ceiling: -1.5, attack: 8, release: 80 }
      },
      loud: {
        targetLufs: -12,
        truePeak: -1.0,
        limiter: { ceiling: -1.0, attack: 6, release: 70 }
      }
    },
    compression: { threshold: -22, ratio: 1.6, attack: 90, release: 280 },
    eq: [
      { freq: 70, gain: -3, type: "highpass" },
      { freq: 220, gain: 1.8 },
      { freq: 4500, gain: -1.5 },
      { freq: 8000, gain: -3.5 }
    ],
    limiter: { ceiling: -1.5, lookahead: 8, release: 80, targetLUFS: -15, maxGR: 1.5 },
    saturation: false,
    truePeakSafetyLimiterDbTp: -1.0
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
    // Soft approach into the limiter; mode LUFS targets already encode quieter intent.
    limiterDrive: 0.75,
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
    // Modest extra drive only — loudness primarily comes from louder LUFS targets.
    limiterDrive: 1.12,
    notes: "Aggressive loudness, use cautiously on dense mixes."
  }
};

/** Integrated LUFS target for a genre + loudness mode (authoritative; matches `loudnessModes`). */
export function getLoudnessModeLufsTarget(
  preset: GenrePreset,
  mode: LoudnessMode
): number {
  return preset.loudnessModes[mode].targetLufs;
}

/** True-peak ceiling (dBTP) for a genre + loudness mode (authoritative; matches `loudnessModes`). */
export function getLoudnessModeTruePeak(preset: GenrePreset, mode: LoudnessMode): number {
  return preset.loudnessModes[mode].truePeak;
}
