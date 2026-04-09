import type { MasterJobAnalysis } from "@/lib/api/master-analysis";
import type { ReadinessVerdict } from "@/lib/audio/readiness";

export type AdaptiveMasterSettingsSummary = {
  source: "ai" | "heuristic";
  rationale: string;
  settings: {
    eqDirection: {
      lowEnd: number;
      lowMid: number;
      presence: number;
      air: number;
    };
    compressionIntensity: "light" | "medium" | "strong";
    saturationAmount: number;
    stereoWidth: number;
    targetLufs: number;
    transientHandling: "preserve" | "balanced" | "tight";
    vocalPresenceEmphasis: number;
  };
};

export type AdaptiveReadinessSummary = {
  verdict: ReadinessVerdict;
  recommendation: string;
};

export type MasterAiResponse = {
  jobId: string;
  mode: "adaptive";
  previews: {
    standard: string;
    adaptive: string;
  };
  download: {
    requiresEmail: true;
    fileId: string;
  };
  analysis: {
    standard: MasterJobAnalysis;
    adaptive: MasterJobAnalysis | null;
  };
  readiness: AdaptiveReadinessSummary | null;
  adaptiveSettings: AdaptiveMasterSettingsSummary;
  validation: {
    correctivePasses: number;
    warnings: string[];
  };
};
