import {
  AR_AI_DISCLAIMER,
  AR_AI_FEATURE,
  AR_AI_LABEL_DISCUSSION_TITLE,
  type ArAiEvaluationInput,
  type ArAiReport
} from "@/lib/ar-ai/types";

type RawOpenAiPayload = {
  summary: string;
  audioAnalysis: string;
  songwritingAnalysis: string;
  commercialAnalysis: string;
  scorecard: ArAiReport["scorecard"];
  overallRating: ArAiReport["overallRating"];
  strengths: ArAiReport["strengths"];
  weaknesses: ArAiReport["weaknesses"];
  improvements: ArAiReport["improvements"];
  labelDiscussionPoints: string;
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function normalizeArAiReport(raw: unknown, input: ArAiEvaluationInput): ArAiReport {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("A&R AI model output was not a JSON object.");
  }

  const payload = raw as Partial<RawOpenAiPayload>;
  const requiredStringFields: (keyof RawOpenAiPayload)[] = [
    "summary",
    "audioAnalysis",
    "songwritingAnalysis",
    "commercialAnalysis",
    "labelDiscussionPoints"
  ];

  for (const field of requiredStringFields) {
    if (typeof payload[field] !== "string" || !payload[field]?.trim()) {
      throw new Error(`A&R AI model output missing or invalid field: ${field}`);
    }
  }

  if (!Array.isArray(payload.scorecard) || payload.scorecard.length === 0) {
    throw new Error("A&R AI model output missing scorecard.");
  }

  if (!payload.overallRating || typeof payload.overallRating !== "object") {
    throw new Error("A&R AI model output missing overallRating.");
  }

  const scorecard = payload.scorecard.map((entry) => ({
    category: String(entry.category),
    score: clampScore(Number(entry.score)),
    why: String(entry.why)
  }));

  const overallRating = {
    score: clampScore(Number(payload.overallRating.score)),
    meaning: String(payload.overallRating.meaning),
    why: String(payload.overallRating.why)
  };

  function normalizeRanked(list: unknown, label: string): ArAiReport["strengths"] {
    if (!Array.isArray(list)) {
      throw new Error(`A&R AI model output missing ${label}.`);
    }
    return list.map((item, index) => ({
      rank: typeof item.rank === "number" ? item.rank : index + 1,
      title: String(item.title),
      explanation: String(item.explanation)
    }));
  }

  const strengths = normalizeRanked(payload.strengths, "strengths");
  const weaknesses = normalizeRanked(payload.weaknesses, "weaknesses");

  if (!Array.isArray(payload.improvements)) {
    throw new Error("A&R AI model output missing improvements.");
  }

  const improvements = payload.improvements.map((item, index) => ({
    rank: typeof item.rank === "number" ? item.rank : index + 1,
    title: String(item.title),
    whyItMatters: String(item.whyItMatters),
    howToImprove: String(item.howToImprove),
    impactLevel: item.impactLevel,
    estimatedRatingIncrease: String(item.estimatedRatingIncrease)
  }));

  let labelDiscussionPoints = payload.labelDiscussionPoints!.trim();
  if (!labelDiscussionPoints.includes(AR_AI_LABEL_DISCUSSION_TITLE)) {
    labelDiscussionPoints = `${AR_AI_LABEL_DISCUSSION_TITLE}\n\n${labelDiscussionPoints}`;
  }

  const report: ArAiReport = {
    feature: AR_AI_FEATURE,
    input: {
      fileName: input.fileName,
      intendedGenre: input.intendedGenre,
      targetAudience: input.targetAudience?.trim() || null,
      releaseIntent: input.releaseIntent?.trim() || null,
      references: input.references?.trim() || null,
      lyricsProvided: Boolean(input.lyrics?.trim())
    },
    summary: payload.summary!.trim(),
    audioAnalysis: payload.audioAnalysis!.trim(),
    songwritingAnalysis: payload.songwritingAnalysis!.trim(),
    commercialAnalysis: payload.commercialAnalysis!.trim(),
    scorecard,
    overallRating,
    strengths,
    weaknesses,
    improvements,
    labelDiscussionPoints,
    disclaimer: AR_AI_DISCLAIMER
  };

  if (input.technicalMetrics) {
    report.technicalMetrics = input.technicalMetrics;
  }

  return report;
}
