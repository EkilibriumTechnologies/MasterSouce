import "server-only";
import { z } from "zod";
import type { TrackAnalysis } from "@/lib/audio/analyze-track";
import type { LoudnessMode } from "@/lib/genre-presets";

export const ADAPTIVE_MASTERING_SYSTEM_PROMPT = `You are the Adaptive AI Mastering decision engine for a production audio pipeline.
You do not process audio directly. You only return strict machine-readable mastering instructions.

Primary objective:
- Produce commercially competitive, streaming-ready mastering guidance.
- Keep processing practical, safe, and consistent.
- Preserve musical intent and translation across playback systems.

Safety and quality rules:
- Avoid extreme or contradictory instructions.
- Do not chase maximum loudness at all costs.
- Preserve dynamics when possible.
- Avoid clipping, brittle high-end, and low-end bloom.
- If signals indicate risk, prefer conservative corrective moves.
- Avoid stacking aggressive compression + saturation + stereo width boosts together.
- If the track appears already close to target, recommend lighter-touch settings.
- Interpret user_intent as directional guidance, not a command to damage quality.
- Do not invent audio facts beyond provided stats/context.

Behavior defaults:
- If user_intent is missing or vague, choose a balanced commercially competitive streaming master with no aggressive extremes.
- Keep output deterministic and production-friendly for an automated backend pipeline.

Output contract:
- Return only data that conforms to the provided JSON schema.
- Do not add extra keys.
- Do not include markdown or prose outside schema fields.`;

const AdaptiveDecisionSchema = z.object({
  target_lufs: z.number().min(-16).max(-7),
  limiter_ceiling_db: z.number().min(-2).max(-0.1),
  eq_low_action: z.enum(["tighten", "reduce", "neutral", "enhance"]),
  eq_mid_action: z.enum(["smooth", "reduce", "neutral", "forward"]),
  eq_high_action: z.enum(["soften", "neutral", "add_presence", "add_air"]),
  compression_amount: z.enum(["low", "medium", "high"]),
  compression_style: z.enum(["glue", "transparent", "punch"]),
  saturation_amount: z.enum(["none", "low", "medium"]),
  stereo_width: z.enum(["narrow", "moderate", "wide"]),
  transient_emphasis: z.enum(["low", "medium", "high"]),
  vocal_presence_focus: z.boolean(),
  notes_for_pipeline: z.array(z.string().min(1).max(120)).min(1).max(6),
  reasoning_summary: z.string().min(1).max(260)
});

export type AdaptiveDecision = z.infer<typeof AdaptiveDecisionSchema>;

type AdaptiveDecisionInput = {
  analysis: TrackAnalysis;
  genre?: string;
  loudnessMode?: LoudnessMode;
  userIntent?: string;
};

export class AdaptiveOpenAIError extends Error {
  public readonly debug?: {
    model: string;
    hasOpenAIApiKey: boolean;
    timeoutMs: number;
    requestBody: Record<string, unknown> | null;
    openAiHttpStatus: number | null;
    openAiErrorPayload: string | null;
  };

  constructor(
    public readonly code: "missing_api_key" | "timeout" | "http_error" | "invalid_schema" | "empty_output",
    message: string,
    debug?: {
      model: string;
      hasOpenAIApiKey: boolean;
      timeoutMs: number;
      requestBody: Record<string, unknown> | null;
      openAiHttpStatus: number | null;
      openAiErrorPayload: string | null;
    }
  ) {
    super(message);
    this.name = "AdaptiveOpenAIError";
    this.debug = debug;
  }
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "target_lufs",
    "limiter_ceiling_db",
    "eq_low_action",
    "eq_mid_action",
    "eq_high_action",
    "compression_amount",
    "compression_style",
    "saturation_amount",
    "stereo_width",
    "transient_emphasis",
    "vocal_presence_focus",
    "notes_for_pipeline",
    "reasoning_summary"
  ],
  properties: {
    target_lufs: { type: "number", minimum: -16, maximum: -7 },
    limiter_ceiling_db: { type: "number", minimum: -2, maximum: -0.1 },
    eq_low_action: { type: "string", enum: ["tighten", "reduce", "neutral", "enhance"] },
    eq_mid_action: { type: "string", enum: ["smooth", "reduce", "neutral", "forward"] },
    eq_high_action: { type: "string", enum: ["soften", "neutral", "add_presence", "add_air"] },
    compression_amount: { type: "string", enum: ["low", "medium", "high"] },
    compression_style: { type: "string", enum: ["glue", "transparent", "punch"] },
    saturation_amount: { type: "string", enum: ["none", "low", "medium"] },
    stereo_width: { type: "string", enum: ["narrow", "moderate", "wide"] },
    transient_emphasis: { type: "string", enum: ["low", "medium", "high"] },
    vocal_presence_focus: { type: "boolean" },
    notes_for_pipeline: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string", minLength: 1, maxLength: 120 }
    },
    reasoning_summary: { type: "string", minLength: 1, maxLength: 260 }
  }
} as const;

function buildUserPayload(input: AdaptiveDecisionInput): string {
  return JSON.stringify(
    {
      analysis: input.analysis,
      context: {
        genre: input.genre ?? null,
        loudnessMode: input.loudnessMode ?? null,
        user_intent: input.userIntent ?? null
      }
    },
    null,
    2
  );
}

function toSafeRedactedRequestBody(input: AdaptiveDecisionInput, model: string, reasoningEffort?: string): Record<string, unknown> {
  const analysis = (input.analysis ?? {}) as Record<string, unknown>;
  const analysisSnapshot = {
    durationSec: typeof analysis.durationSec === "number" ? analysis.durationSec : null,
    integratedLufs: typeof analysis.integratedLufs === "number" ? analysis.integratedLufs : null,
    peakDb: typeof analysis.peakDb === "number" ? analysis.peakDb : null,
    crestDb: typeof analysis.crestDb === "number" ? analysis.crestDb : null
  };

  const safeUserIntent = input.userIntent ? `${input.userIntent.slice(0, 200)}${input.userIntent.length > 200 ? "…<truncated>" : ""}` : null;

  return {
    model,
    reasoning: reasoningEffort ? { effort: reasoningEffort } : null,
    input: {
      analysis: analysisSnapshot,
      context: {
        genre: input.genre ?? null,
        loudnessMode: input.loudnessMode ?? null,
        user_intent: safeUserIntent
      },
      redaction: {
        mode: "safe_debug",
        analysisKeys: Object.keys(analysis),
        systemPromptIncluded: false
      }
    }
  };
}

export async function requestAdaptiveDecisionFromOpenAI(input: AdaptiveDecisionInput): Promise<AdaptiveDecision> {
  const model = process.env.OPENAI_ADAPTIVE_MODEL?.trim() || "gpt-5-mini";
  const timeoutMs = Number(process.env.OPENAI_ADAPTIVE_TIMEOUT_MS ?? "12000");
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? timeoutMs : 12000;
  const reasoningEffort = process.env.OPENAI_ADAPTIVE_REASONING_EFFORT?.trim();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AdaptiveOpenAIError("missing_api_key", "OPENAI_API_KEY is not configured.", {
      model,
      hasOpenAIApiKey: false,
      timeoutMs: safeTimeoutMs,
      requestBody: null,
      openAiHttpStatus: null,
      openAiErrorPayload: null
    });
  }

  const hasOpenAIApiKey = true;
  const safeDebugRequestBody = toSafeRedactedRequestBody(input, model, reasoningEffort);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), safeTimeoutMs);

  try {
    const body: Record<string, unknown> = {
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: ADAPTIVE_MASTERING_SYSTEM_PROMPT }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildUserPayload(input) }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "adaptive_mastering_decision",
          strict: true,
          schema: RESPONSE_SCHEMA
        }
      }
    };

    if (reasoningEffort) {
      body.reasoning = { effort: reasoningEffort };
    }

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new AdaptiveOpenAIError("http_error", `OpenAI Responses API error (${res.status}): ${errText.slice(0, 500)}`, {
        model,
        hasOpenAIApiKey,
        timeoutMs: safeTimeoutMs,
        requestBody: safeDebugRequestBody,
        openAiHttpStatus: res.status,
        openAiErrorPayload: errText || null
      });
    }

    const payload = (await res.json()) as {
      output_text?: string | null;
      output?: Array<{
        type?: string;
        role?: string;
        content?: Array<{
          type?: string;
          text?: string;
        }>;
      }>;
    };

    const isLocalDev = process.env.NODE_ENV !== "production";
    if (isLocalDev) {
      console.debug("[ADAPTIVE_OPENAI_DEBUG] raw_responses_json", JSON.stringify(payload, null, 2));
      console.debug("[ADAPTIVE_OPENAI_DEBUG] parser_primary_path", "payload.output_text");
    }

    const outputText =
      (typeof payload.output_text === "string" && payload.output_text.trim().length > 0
        ? payload.output_text
        : payload.output
            ?.flatMap((entry) => entry.content ?? [])
            .find((contentItem) => contentItem?.type === "output_text" && typeof contentItem.text === "string" && contentItem.text.trim().length > 0)
            ?.text) ?? null;

    if (!outputText) {
      throw new AdaptiveOpenAIError("empty_output", "OpenAI returned no structured output text.", {
        model,
        hasOpenAIApiKey,
        timeoutMs: safeTimeoutMs,
        requestBody: safeDebugRequestBody,
        openAiHttpStatus: res.status,
        openAiErrorPayload: null
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(outputText);
    } catch {
      throw new AdaptiveOpenAIError("invalid_schema", "OpenAI structured output was not valid JSON.", {
        model,
        hasOpenAIApiKey,
        timeoutMs: safeTimeoutMs,
        requestBody: safeDebugRequestBody,
        openAiHttpStatus: res.status,
        openAiErrorPayload: outputText
      });
    }

    const parsed = AdaptiveDecisionSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new AdaptiveOpenAIError("invalid_schema", "OpenAI structured output did not match adaptive schema.", {
        model,
        hasOpenAIApiKey,
        timeoutMs: safeTimeoutMs,
        requestBody: safeDebugRequestBody,
        openAiHttpStatus: res.status,
        openAiErrorPayload: outputText
      });
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof AdaptiveOpenAIError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AdaptiveOpenAIError("timeout", `OpenAI adaptive decision timed out after ${safeTimeoutMs}ms.`, {
        model,
        hasOpenAIApiKey,
        timeoutMs: safeTimeoutMs,
        requestBody: safeDebugRequestBody,
        openAiHttpStatus: null,
        openAiErrorPayload: null
      });
    }
    throw new AdaptiveOpenAIError("http_error", error instanceof Error ? error.message : "Unknown OpenAI error.", {
      model,
      hasOpenAIApiKey,
      timeoutMs: safeTimeoutMs,
      requestBody: safeDebugRequestBody,
      openAiHttpStatus: null,
      openAiErrorPayload: null
    });
  } finally {
    clearTimeout(timer);
  }
}
