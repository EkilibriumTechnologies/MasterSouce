import { AR_AI_SCORECARD_CATEGORIES } from "@/lib/ar-ai/types";

const rankedItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rank", "title", "explanation"],
  properties: {
    rank: { type: "integer", minimum: 1, maximum: 10 },
    title: { type: "string", minLength: 1, maxLength: 200 },
    explanation: { type: "string", minLength: 1, maxLength: 1200 }
  }
} as const;

const improvementSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rank", "title", "whyItMatters", "howToImprove", "impactLevel", "estimatedRatingIncrease"],
  properties: {
    rank: { type: "integer", minimum: 1, maximum: 10 },
    title: { type: "string", minLength: 1, maxLength: 200 },
    whyItMatters: { type: "string", minLength: 1, maxLength: 900 },
    howToImprove: { type: "string", minLength: 1, maxLength: 1200 },
    impactLevel: {
      type: "string",
      enum: ["Low Impact", "Medium Impact", "High Impact", "Very High Impact"]
    },
    estimatedRatingIncrease: { type: "string", minLength: 1, maxLength: 120 }
  }
} as const;

export const AR_AI_OPENAI_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "audioAnalysis",
    "songwritingAnalysis",
    "commercialAnalysis",
    "scorecard",
    "overallRating",
    "strengths",
    "weaknesses",
    "improvements",
    "labelDiscussionPoints"
  ],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 2200 },
    audioAnalysis: { type: "string", minLength: 1, maxLength: 6000 },
    songwritingAnalysis: { type: "string", minLength: 1, maxLength: 6000 },
    commercialAnalysis: { type: "string", minLength: 1, maxLength: 6000 },
    scorecard: {
      type: "array",
      minItems: AR_AI_SCORECARD_CATEGORIES.length,
      maxItems: AR_AI_SCORECARD_CATEGORIES.length,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "score", "why"],
        properties: {
          category: { type: "string", enum: [...AR_AI_SCORECARD_CATEGORIES] },
          score: { type: "integer", minimum: 0, maximum: 100 },
          why: { type: "string", minLength: 1, maxLength: 900 }
        }
      }
    },
    overallRating: {
      type: "object",
      additionalProperties: false,
      required: ["score", "meaning", "why"],
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        meaning: { type: "string", minLength: 1, maxLength: 220 },
        why: { type: "string", minLength: 1, maxLength: 1200 }
      }
    },
    strengths: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: rankedItemSchema
    },
    weaknesses: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: rankedItemSchema
    },
    improvements: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: improvementSchema
    },
    labelDiscussionPoints: { type: "string", minLength: 1, maxLength: 4000 }
  }
} as const;
