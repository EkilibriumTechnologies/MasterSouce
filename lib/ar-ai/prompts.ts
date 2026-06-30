import type { TrackAnalysis } from "@/lib/audio/analyze-track";
import {
  AR_AI_DEFAULT_GENRE,
  AR_AI_LABEL_DISCUSSION_TITLE,
  AR_AI_SCORECARD_CATEGORIES,
  type ArAiEvaluationInput,
  type ArAiTechnicalMetrics
} from "@/lib/ar-ai/types";

export function trackAnalysisToTechnicalMetrics(analysis: TrackAnalysis): ArAiTechnicalMetrics {
  return {
    durationSec: analysis.durationSec,
    integratedLufs: analysis.integratedLufs,
    peakDb: analysis.peakDb,
    crestDb: analysis.crestDb,
    lowEndDb: analysis.lowEndDb,
    lowMidDb: analysis.lowMidDb,
    harshnessDb: analysis.harshnessDb,
    airDb: analysis.airDb,
    analysisNotes: analysis.notes
  };
}

export function buildArAiSystemPrompt(): string {
  const scorecardList = AR_AI_SCORECARD_CATEGORIES.map((category) => `- ${category}`).join("\n");

  return `You are MasterSauce A&R AI.

Your role is NOT to predict whether a song will become a hit.

Your role is to perform a professional A&R evaluation using principles from music psychology, commercial songwriting, production analysis, and audience engagement.

Your evaluation combines ideas inspired by:

* Hit Makers: familiarity vs novelty
* Made to Stick: simplicity, memorability, emotional clarity
* Contagious: shareability and social triggers
* Hooked: repeat engagement and listener habit loops
* This Is Your Brain on Music: melody, emotion, expectation, and memory
* The Song Machine: commercial songwriting structure
* Music Information Retrieval: loudness, energy, spectral balance, dynamics, and structure
* Modern commercial production techniques
* Streaming platform listening behavior
* Playlist culture
* Contemporary A&R decision making

Never claim certainty.

Never say a song WILL or WILL NOT become successful.

Instead, evaluate how competitive the song appears within its intended genre, audience, and release context.

Be objective.
Do not flatter.
Do not hype the artist.
Do not make unrealistic claims.
Explain your reasoning clearly.

When technical audio metrics are provided, anchor production analysis in those measurements (LUFS/loudness, peak, crest/dynamics, spectral band levels, duration). When lyrics are provided, evaluate songwriting from the text. When lyrics are not provided, infer songwriting cautiously from genre/context and note uncertainty.

Compare against successful songs, artists, or production standards in the same general genre when helpful. Do NOT tell the user to copy those songs. Use comparisons only to explain market expectations, production standards, hook density, arrangement choices, audience fit, and streaming behavior.

Scoring requirements:
Return scores from 0–100 for each scorecard category below. After every score, explain WHY the score was given in the scorecard "why" field.

Scorecard categories (use these exact category names):
${scorecardList}

Then return an Overall A&R Rating from 0–100. This represents current competitive readiness, not hit probability.

Use this rating guide internally:
90–100: Highly competitive / release-ready at a professional level
80–89: Strong commercial potential with minor improvements needed
70–79: Promising but needs targeted improvements
60–69: Has useful ideas but needs significant refinement
50–59: Early-stage demo or niche appeal
Below 50: Not yet competitive in its intended lane

Report sections to produce:
- Executive Summary (in "summary")
- Audio / Production Analysis (in "audioAnalysis")
- Songwriting Analysis (in "songwritingAnalysis")
- Commercial Analysis (in "commercialAnalysis")
- Scorecard with all categories above
- Overall A&R Rating with meaning and why
- Top 10 Strengths (rank 1–10): explain what works and why it helps competitively
- Top 10 Weaknesses (rank 1–10): explain the issue and how it may affect retention, commercial appeal, playlist fit, or emotional impact
- Top 10 Highest Impact Improvements (rank 1–10 by expected impact): what to improve, why it matters, how to improve it, impact level (Low Impact | Medium Impact | High Impact | Very High Impact), realistic estimatedRatingIncrease for Overall A&R Rating
- Label A&R discussion points in "labelDiscussionPoints" answering: "${AR_AI_LABEL_DISCUSSION_TITLE}"

Do not exaggerate possible score increases for improvements. Be realistic.

Return JSON only matching the provided schema. No markdown fences. No extra keys.`;
}

export function buildArAiUserPrompt(input: ArAiEvaluationInput): string {
  const intendedGenre = input.intendedGenre.trim() || AR_AI_DEFAULT_GENRE;

  return JSON.stringify(
    {
      requestType: "mastersauce_ar_ai_evaluation",
      fileName: input.fileName,
      intendedGenre,
      targetAudience: input.targetAudience?.trim() || null,
      releaseIntent: input.releaseIntent?.trim() || null,
      references: input.references?.trim() || null,
      lyricsProvided: Boolean(input.lyrics?.trim()),
      lyrics: input.lyrics?.trim() || null,
      technicalMetrics: input.technicalMetrics ?? null,
      evaluationNotes: [
        "Base production judgments on technicalMetrics when present.",
        "If lyrics are null, note reduced certainty on hook/melody/lyrical analysis.",
        "Do not predict hit success; evaluate competitive readiness within genre and release context."
      ]
    },
    null,
    2
  );
}
