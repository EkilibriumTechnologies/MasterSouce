import "server-only";
import { z } from "zod";
import type { TrackAnalysis } from "@/lib/audio/analyze-track";
import type { LoudnessMode } from "@/lib/genre-presets";

export const ADAPTIVE_OPENAI_TIMEOUT_MAX_MS = 20000;

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
- If reference_track_analysis is provided, use it as tonal/loudness/balance guidance for the user's mix — match character partially, not identically.
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

export type AdaptiveDecisionInput = {
  analysis: TrackAnalysis;
  genre?: string;
  loudnessMode?: LoudnessMode;
  userIntent?: string;
  referenceAnalysis?: TrackAnalysis;
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
        user_intent: input.userIntent ?? null,
        reference_track_analysis: input.referenceAnalysis ?? null
      }
    },
    null,
    2
  );
}

/**
 * OpenAI Responses API `reasoning.effort` is only valid on o-series and gpt-5 models —
 * not gpt-4o, gpt-4.1, or other non-reasoning chat models.
 */
export function supportsReasoningEffort(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (/^o\d+/.test(id)) {
    return true;
  }
  if (/^gpt-5/.test(id)) {
    return true;
  }
  return false;
}

function resolveAdaptiveReasoningEffort(model: string): string | undefined {
  if (!supportsReasoningEffort(model)) {
    return undefined;
  }
  return process.env.OPENAI_ADAPTIVE_REASONING_EFFORT?.trim() || "low";
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

/** Model id uses the letter "o" in `4o` (gpt-4o-mini), never `40`. */
export function getAdaptiveOpenAiModel(): string {
  return process.env.OPENAI_ADAPTIVE_MODEL?.trim() || "gpt-4o-mini";
}

export function getAdaptiveOpenAiTimeoutDiagnostics(): {
  model: string;
  rawEnvTimeoutMs: number | null;
  resolvedTimeoutMs: number;
} {
  const model = getAdaptiveOpenAiModel();
  const rawStr = process.env.OPENAI_ADAPTIVE_TIMEOUT_MS?.trim();
  if (!rawStr) {
    return { model, rawEnvTimeoutMs: null, resolvedTimeoutMs: Math.min(12000, ADAPTIVE_OPENAI_TIMEOUT_MAX_MS) };
  }
  const parsed = Number(rawStr);
  const rawEnvTimeoutMs = Number.isFinite(parsed) ? parsed : null;
  const baseMs = rawEnvTimeoutMs ?? 12000;
  const resolvedTimeoutMs = Math.min(baseMs, ADAPTIVE_OPENAI_TIMEOUT_MAX_MS);
  return { model, rawEnvTimeoutMs, resolvedTimeoutMs };
}

export function isAdaptiveMasteringOpenAiFatalError(error: AdaptiveOpenAIError): boolean {
  if (error.code === "timeout") {
    return false;
  }
  if (error.code === "missing_api_key" || error.code === "invalid_schema" || error.code === "empty_output") {
    return true;
  }
  if (error.code !== "http_error") {
    return true;
  }
  const status = error.debug?.openAiHttpStatus;
  if (status === 401 || status === 403 || status === 429 || status === 404) {
    return true;
  }
  if (status === 400) {
    const p = (error.debug?.openAiErrorPayload ?? "").toLowerCase();
    if (
      p.includes("invalid_api_key") ||
      p.includes("incorrect api key") ||
      p.includes("invalid api key") ||
      p.includes("insufficient_quota") ||
      p.includes("quota") ||
      (p.includes("model") && (p.includes("not found") || p.includes("does not exist") || p.includes("unknown model")))
    ) {
      return true;
    }
  }
  return true;
}

type SingleAttemptMeta = {
  model: string;
  resolvedTimeoutMs: number;
};

async function requestAdaptiveDecisionFromOpenAISingleAttempt(
  input: AdaptiveDecisionInput,
  meta: SingleAttemptMeta
): Promise<AdaptiveDecision> {
  const { model, resolvedTimeoutMs } = meta;
  const reasoningEffort = resolveAdaptiveReasoningEffort(model);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AdaptiveOpenAIError("missing_api_key", "OPENAI_API_KEY is not configured.", {
      model,
      hasOpenAIApiKey: false,
      timeoutMs: resolvedTimeoutMs,
      requestBody: null,
      openAiHttpStatus: null,
      openAiErrorPayload: null
    });
  }

  const hasOpenAIApiKey = true;
  const safeDebugRequestBody = toSafeRedactedRequestBody(input, model, reasoningEffort);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolvedTimeoutMs);

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
      },
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {})
    };

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
        timeoutMs: resolvedTimeoutMs,
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
        timeoutMs: resolvedTimeoutMs,
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
        timeoutMs: resolvedTimeoutMs,
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
        timeoutMs: resolvedTimeoutMs,
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
      throw new AdaptiveOpenAIError("timeout", `OpenAI adaptive decision timed out after ${resolvedTimeoutMs}ms.`, {
        model,
        hasOpenAIApiKey,
        timeoutMs: resolvedTimeoutMs,
        requestBody: safeDebugRequestBody,
        openAiHttpStatus: null,
        openAiErrorPayload: null
      });
    }
    throw new AdaptiveOpenAIError("http_error", error instanceof Error ? error.message : "Unknown OpenAI error.", {
      model,
      hasOpenAIApiKey,
      timeoutMs: resolvedTimeoutMs,
      requestBody: safeDebugRequestBody,
      openAiHttpStatus: null,
      openAiErrorPayload: null
    });
  } finally {
    clearTimeout(timer);
  }
}

export type TryAdaptiveOpenAiDecisionResult =
  | { ok: true; decision: AdaptiveDecision }
  | { ok: false; reason: "timeout" };

/**
 * Up to two attempts on OpenAI timeout only; other failures throw {@link AdaptiveOpenAIError}.
 * Timeout is clamped to {@link ADAPTIVE_OPENAI_TIMEOUT_MAX_MS}; logs raw vs resolved timeout once.
 */
export async function tryRequestAdaptiveDecisionWithTimeoutRetry(input: AdaptiveDecisionInput): Promise<TryAdaptiveOpenAiDecisionResult> {
  const { model, rawEnvTimeoutMs, resolvedTimeoutMs } = getAdaptiveOpenAiTimeoutDiagnostics();
  console.info("[adaptive-openai] timeout_config", { rawEnvTimeoutMs, resolvedTimeoutMs, model });

  for (let retryAttempt = 0; retryAttempt < 2; retryAttempt += 1) {
    const startedAt = Date.now();
    try {
      const decision = await requestAdaptiveDecisionFromOpenAISingleAttempt(input, {
        model,
        resolvedTimeoutMs
      });
      const elapsedMs = Date.now() - startedAt;
      console.info("[adaptive-openai] attempt_ok", {
        model,
        timeoutMs: resolvedTimeoutMs,
        retryAttempt,
        elapsedMs,
        fallbackUsed: false,
        errorCode: null
      });
      return { ok: true, decision };
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      if (err instanceof AdaptiveOpenAIError && err.code === "timeout") {
        console.warn("[adaptive-openai] attempt_timeout", {
          model,
          timeoutMs: resolvedTimeoutMs,
          retryAttempt,
          elapsedMs,
          fallbackUsed: false,
          errorCode: "timeout"
        });
        if (retryAttempt >= 1) {
          console.warn("[adaptive-openai] timeout_fallback_selected", {
            model,
            timeoutMs: resolvedTimeoutMs,
            retryAttempt,
            elapsedMs,
            fallbackUsed: true,
            errorCode: "timeout"
          });
          return { ok: false, reason: "timeout" };
        }
        continue;
      }
      throw err;
    }
  }

  return { ok: false, reason: "timeout" };
}
