import type { TrackAnalysis } from "@/lib/audio/analyze-track";
import { GENRE_PRESETS } from "@/lib/genre-presets";

export type SuggestedMasteringPresetKey = keyof typeof GENRE_PRESETS;

export type SuggestedMasteringPresetResult = {
  /** Existing preset key when evidence is strong enough; otherwise null (keep UI default). */
  key: SuggestedMasteringPresetKey | null;
  label: string | null;
  /**
   * Relative score for the winning preset when suggested.
   * Not user-facing; useful for tests/logging.
   */
  score: number | null;
};

type ScoreRow = { key: SuggestedMasteringPresetKey; score: number };

/**
 * Deterministic Suggested Mastering Preset heuristic.
 *
 * Inputs used (existing Track Analysis only):
 * - lowEndDb, lowMidDb, harshnessDb, airDb
 * - crestDb, integratedLufs, alreadyLimited
 *
 * Rules (relative scoring — not a genre classifier):
 * - Strong low end + louder/limited material → Hip-Hop / EDM / Reggaeton candidates
 * - Hot presence + air → EDM lean
 * - High crest + mid energy → Rock lean
 * - Soft crest + quieter air → Lo-Fi lean
 * - Warm low-mids + moderate crest → R&B lean
 * - Otherwise balanced spectrum → Pop lean
 *
 * Fallback:
 * - If metrics are mostly missing, or the top score does not beat the runner-up by a
 *   clear margin, return null so the client keeps its current default selection.
 *
 * Limitations:
 * - Spectral band approximations are coarse; this is a suggestion, not certainty.
 * - Does not use lyrics, BPM, or external ML models.
 */
export function suggestMasteringPreset(analysis: TrackAnalysis): SuggestedMasteringPresetResult {
  const { lowEndDb, lowMidDb, harshnessDb, airDb, crestDb, integratedLufs, alreadyLimited } = analysis;

  const usableMetrics = [lowEndDb, lowMidDb, harshnessDb, airDb, crestDb, integratedLufs].filter(
    (value) => value !== null && Number.isFinite(value)
  ).length;
  if (usableMetrics < 3) {
    return { key: null, label: null, score: null };
  }

  const scores: Record<SuggestedMasteringPresetKey, number> = {
    pop: 1,
    hiphop: 0,
    edm: 0,
    rock: 0,
    reggaeton: 0,
    rnb: 0,
    lofi: 0
  };

  if (lowEndDb !== null) {
    if (lowEndDb > -18) {
      scores.hiphop += 2.2;
      scores.edm += 1.6;
      scores.reggaeton += 2;
    } else if (lowEndDb > -22) {
      scores.hiphop += 1.2;
      scores.reggaeton += 1.1;
      scores.rnb += 0.8;
      scores.pop += 0.4;
    } else if (lowEndDb < -28) {
      scores.lofi += 1.4;
      scores.rock += 0.5;
      scores.pop += 0.3;
    }
  }

  if (lowMidDb !== null) {
    if (lowMidDb > -20) {
      scores.rnb += 1.5;
      scores.reggaeton += 0.8;
      scores.rock += 0.6;
    } else if (lowMidDb < -28) {
      scores.edm += 0.7;
      scores.lofi += 0.5;
    }
  }

  if (harshnessDb !== null) {
    if (harshnessDb > -22) {
      scores.edm += 1.8;
      scores.rock += 1.2;
      scores.pop += 0.5;
    } else if (harshnessDb < -30) {
      scores.lofi += 1.2;
      scores.rnb += 0.7;
    }
  }

  if (airDb !== null) {
    if (airDb > -28) {
      scores.edm += 1.4;
      scores.pop += 0.8;
    } else if (airDb < -36) {
      scores.lofi += 1.6;
      scores.hiphop += 0.4;
    }
  }

  if (crestDb !== null) {
    if (crestDb > 12) {
      scores.rock += 1.8;
      scores.lofi += 0.9;
      scores.rnb += 0.5;
    } else if (crestDb < 7) {
      scores.edm += 1.3;
      scores.hiphop += 1.1;
      scores.reggaeton += 1;
      if (alreadyLimited) {
        scores.edm += 0.6;
        scores.hiphop += 0.4;
      }
    } else {
      scores.pop += 0.8;
      scores.rnb += 0.5;
    }
  }

  if (integratedLufs !== null) {
    if (integratedLufs > -10) {
      scores.edm += 0.9;
      scores.hiphop += 0.7;
      scores.reggaeton += 0.6;
    } else if (integratedLufs < -16) {
      scores.lofi += 1.1;
      scores.rock += 0.4;
    } else {
      scores.pop += 0.6;
    }
  }

  if (alreadyLimited) {
    scores.edm += 0.5;
    scores.hiphop += 0.4;
    scores.reggaeton += 0.3;
  }

  const ranked: ScoreRow[] = (Object.keys(scores) as SuggestedMasteringPresetKey[])
    .map((key) => ({ key, score: scores[key] }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];
  if (!top || !second) {
    return { key: null, label: null, score: null };
  }

  // Require a clear relative win so weak evidence keeps the existing UI default.
  const margin = top.score - second.score;
  if (top.score < 2.5 || margin < 0.55) {
    return { key: null, label: null, score: null };
  }

  return {
    key: top.key,
    label: GENRE_PRESETS[top.key].label,
    score: Number(top.score.toFixed(2))
  };
}
