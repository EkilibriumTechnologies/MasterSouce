import type { MasterJobAnalysis } from "@/lib/api/master-analysis";
import type { MasteringDecisionReport } from "@/lib/audio/mastering-decision-report";
import type { AdaptiveAnalysisDiagnostics } from "@/lib/audio/adaptive-track-analysis";
import type { MasterCharacter } from "@/lib/audio/master-character";
import type {
  AudioArtifactProfile,
  AudioRestorationResult,
  AudioRestorationStrength
} from "@/lib/audio/audio-restoration-types";
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
  /** Selected Master Character used for this Adaptive render. */
  masterCharacter: MasterCharacter;
  decisionReport: MasteringDecisionReport;
  validation: {
    correctivePasses: number;
    warnings: string[];
  };
  adaptiveAiFallback?: boolean;
  adaptiveAiFallbackReason?: "timeout";
  adaptiveAiFallbackMessage?: string;
  referenceTrackApplied?: boolean;
  audioRestoration?: {
    available: boolean;
    requested: boolean;
    recommended: boolean;
    strength: AudioRestorationStrength;
    artifactProfile: AudioArtifactProfile;
    result: Omit<AudioRestorationResult, "inputPath" | "outputPath">;
    selectedSource: "original_source" | "restored_source";
  };
  analysisDiagnostics?: {
    baseline: AdaptiveAnalysisDiagnostics;
    adaptive: AdaptiveAnalysisDiagnostics | null;
  };
};
