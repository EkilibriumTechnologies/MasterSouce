import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import { hasTrustedEmailAccess } from "@/lib/security/verified-email-state";
import { recordSongArchitectGenerationEvent } from "@/lib/song-architect/entitlements";
import { normalizeSongArchitectOutput } from "@/lib/song-architect/normalize-output";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/song-architect/prompts";
import { resolveSongArchitectInput } from "@/lib/song-architect/resolve-input";
import { resolveSongArchitectVerifiedContext } from "@/lib/song-architect/access";
import type { SongArchitectInput, SongArchitectResolvedInput } from "@/lib/song-architect/types";

const MAX_RESPONSE_TOKENS = 2200;
const MAX_TIMEOUT_MS = 90000;
const DEFAULT_TIMEOUT_MS = 45000;
const SONG_ARCHITECT_DEBUG = process.env.SONG_ARCHITECT_DEBUG === "1";
const DEFAULT_REASONING_EFFORT = "low";

const SongArchitectInputSchema = z.object({
  preset: z.string().trim().min(1).max(60).optional(),
  genre: z.string().trim().min(1).max(40).optional(),
  theme: z.string().trim().min(1).max(160).optional(),
  angle: z.string().trim().min(1).max(160).optional(),
  emotion: z.string().trim().min(1).max(100).optional(),
  hookIdentity: z.string().trim().min(1).max(160).optional(),
  structure: z.string().trim().min(1).max(220).optional(),
  energyCurve: z.string().trim().min(1).max(180).optional(),
  language: z.string().trim().min(1).max(40).optional(),
  vocalStyle: z.string().trim().min(1).max(140).optional(),
  lineDensity: z.enum(["sparse", "balanced", "dense"]).optional(),
  referenceArtists: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
  mustInclude: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  avoidWords: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  userNotes: z.string().trim().max(700).optional()
});
const SongArchitectRequestSchema = SongArchitectInputSchema.extend({
  billingEmail: z.string().trim().optional()
});

const OPENAI_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["concept", "lyricsSections", "performanceNotes", "altHooks", "exportPrompt"],
  properties: {
    concept: {
      type: "object",
      additionalProperties: false,
      required: ["theme", "angle", "emotion", "hookIdentity", "tensionWords", "structure", "energyCurve"],
      properties: {
        theme: { type: "string", minLength: 1, maxLength: 220 },
        angle: { type: "string", minLength: 1, maxLength: 220 },
        emotion: { type: "string", minLength: 1, maxLength: 140 },
        hookIdentity: { type: "string", minLength: 1, maxLength: 220 },
        tensionWords: {
          type: "array",
          minItems: 2,
          maxItems: 10,
          items: { type: "string", minLength: 1, maxLength: 40 }
        },
        structure: { type: "string", minLength: 1, maxLength: 260 },
        energyCurve: { type: "string", minLength: 1, maxLength: 220 }
      }
    },
    lyricsSections: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "lines"],
        properties: {
          section: { type: "string", minLength: 1, maxLength: 80 },
          lines: {
            type: "array",
            maxItems: 24,
            items: { type: "string", minLength: 1, maxLength: 240 }
          }
        }
      }
    },
    performanceNotes: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 220 }
    },
    altHooks: {
      type: "array",
      maxItems: 6,
      items: { type: "string", minLength: 1, maxLength: 180 }
    },
    exportPrompt: { type: "string", minLength: 1, maxLength: 9000 }
  }
} as const;

class SongArchitectOpenAIError extends Error {
  constructor(
    public readonly code:
      | "missing_api_key"
      | "timeout"
      | "http_error"
      | "empty_output"
      | "invalid_json"
      | "rate_limit"
      | "token_limit"
      | "invalid_model",
    message: string
  ) {
    super(message);
    this.name = "SongArchitectOpenAIError";
  }
}

function logDebug(event: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production" || SONG_ARCHITECT_DEBUG) {
    console.info("[song-architect] debug", { event, ...payload });
  }
}

async function requestSongArchitectFromOpenAI(input: SongArchitectInput): Promise<{
  outputText: string;
  model: string;
  presetUsed?: string;
  resolvedInput: SongArchitectResolvedInput;
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new SongArchitectOpenAIError("missing_api_key", "OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_SONG_ARCHITECT_MODEL?.trim() || "gpt-5-mini";
  const timeoutMsRaw = Number(process.env.OPENAI_SONG_ARCHITECT_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.min(Math.max(timeoutMsRaw, 3000), MAX_TIMEOUT_MS) : MAX_TIMEOUT_MS;
  const reasoningEffort = process.env.OPENAI_SONG_ARCHITECT_REASONING_EFFORT?.trim() || DEFAULT_REASONING_EFFORT;

  const { resolved, presetUsed } = resolveSongArchitectInput(input);
  async function callOpenAI(args: {
    attempt: number;
    timeoutMs: number;
    maxOutputTokens: number;
    reasoningEffort?: string;
  }): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    const startedAt = Date.now();

    try {
      const body: Record<string, unknown> = {
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: buildSystemPrompt(resolved) }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: buildUserPrompt(resolved) }]
          }
        ],
        max_output_tokens: args.maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: "song_architect_output",
            strict: true,
            schema: OPENAI_RESPONSE_SCHEMA
          }
        }
      };

      if (args.reasoningEffort) {
        body.reasoning = { effort: args.reasoningEffort };
      }

      logDebug("openai_request_start", {
        attempt: args.attempt,
        model,
        timeoutMs: args.timeoutMs,
        maxOutputTokens: args.maxOutputTokens,
        reasoningEffort: args.reasoningEffort ?? "none"
      });

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        const errorText = errText.slice(0, 600);
        const lowerText = errorText.toLowerCase();
        const elapsedMs = Date.now() - startedAt;

        logDebug("openai_request_failed", {
          attempt: args.attempt,
          status: response.status,
          elapsedMs,
          bodyPreview: errorText
        });

        if (response.status === 429 || lowerText.includes("rate limit")) {
          throw new SongArchitectOpenAIError("rate_limit", `OpenAI rate limit: ${errorText}`);
        }
        if (lowerText.includes("invalid_json_schema") || lowerText.includes("response_format")) {
          throw new SongArchitectOpenAIError("invalid_json", `OpenAI schema configuration error: ${errorText}`);
        }
        if (response.status === 400 && (lowerText.includes("context length") || lowerText.includes("maximum context"))) {
          throw new SongArchitectOpenAIError("token_limit", `OpenAI context/token limit: ${errorText}`);
        }
        if (response.status === 400 && (lowerText.includes("model") || lowerText.includes("unknown model"))) {
          throw new SongArchitectOpenAIError("invalid_model", `OpenAI model configuration error: ${errorText}`);
        }
        throw new SongArchitectOpenAIError("http_error", `OpenAI error ${response.status}: ${errorText}`);
      }

      const payload = (await response.json()) as {
        id?: string;
        model?: string;
        status?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
        };
        output_text?: string | null;
        output?: Array<{
          content?: Array<{
            type?: string;
            text?: string;
          }>;
        }>;
      };

      const elapsedMs = Date.now() - startedAt;
      logDebug("openai_request_end", {
        attempt: args.attempt,
        responseId: payload.id ?? null,
        responseModel: payload.model ?? null,
        responseStatus: payload.status ?? null,
        elapsedMs,
        usage: payload.usage ?? null,
        hasOutputText: Boolean(payload.output_text && payload.output_text.trim())
      });

      const likelyTokenExhausted =
        payload.status === "incomplete" &&
        typeof payload.usage?.output_tokens === "number" &&
        payload.usage.output_tokens >= args.maxOutputTokens - 1;

      const outputText =
        (typeof payload.output_text === "string" && payload.output_text.trim()
          ? payload.output_text
          : payload.output
              ?.flatMap((entry) => entry.content ?? [])
              .find((item) => item?.type === "output_text" && typeof item.text === "string" && item.text.trim())
              ?.text) ?? null;

      if (!outputText) {
        if (likelyTokenExhausted) {
          throw new SongArchitectOpenAIError(
            "token_limit",
            "OpenAI response ended incomplete due to output token exhaustion."
          );
        }
        throw new SongArchitectOpenAIError("empty_output", "OpenAI returned no usable output.");
      }

      return outputText;
    } catch (error) {
      if (error instanceof SongArchitectOpenAIError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new SongArchitectOpenAIError("timeout", `Song Architect timed out after ${args.timeoutMs}ms.`);
      }
      throw new SongArchitectOpenAIError("http_error", error instanceof Error ? error.message : "Unknown OpenAI error.");
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const outputText = await callOpenAI({
      attempt: 1,
      timeoutMs,
      maxOutputTokens: MAX_RESPONSE_TOKENS,
      reasoningEffort
    });
    return { outputText, model, presetUsed, resolvedInput: resolved };
  } catch (error) {
    // Slow responses are common with strict JSON schema + long-form lyrics.
    // Retry once with a longer timeout and simpler reasoning settings.
    if (error instanceof SongArchitectOpenAIError && (error.code === "timeout" || error.code === "token_limit")) {
      const retryOutputText = await callOpenAI({
        attempt: 2,
        timeoutMs: Math.min(Math.round(timeoutMs * 1.5), MAX_TIMEOUT_MS),
        maxOutputTokens: Math.min(4200, Math.max(2800, Math.round(MAX_RESPONSE_TOKENS * 1.5))),
        reasoningEffort: DEFAULT_REASONING_EFFORT
      });
      return { outputText: retryOutputText, model, presetUsed, resolvedInput: resolved };
    }

    throw error;
  }
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  const sessionPrep = prepareSessionForRequest(request);
  const clientIp = getClientIp(request);
  const generateRate = consumeRateLimit({
    bucket: "song_architect_generate_ip",
    key: clientIp,
    limit: 10,
    windowMs: 60 * 60 * 1000
  });
  if (!generateRate.allowed) {
    logAbuseGuard("rate_limited", {
      endpoint: "/api/song-architect/generate",
      bucket: "song_architect_generate_ip",
      ipHash: hashIdentifier(clientIp),
      retryAfterSec: generateRate.retryAfterSec
    });
    const res = tooManyAttemptsResponse(generateRate.retryAfterSec);
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const res = NextResponse.json(
        {
          ok: false,
          error: "invalid_json",
          code: "invalid_json",
          message: "Expected JSON body."
        },
        { status: 400 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    if (!body || typeof body !== "object") {
      const res = NextResponse.json(
        {
          ok: false,
          error: "empty_payload",
          code: "empty_payload",
          message: "Song Architect input payload cannot be empty."
        },
        { status: 400 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const parsed = SongArchitectRequestSchema.safeParse(body);
    if (!parsed.success) {
      const res = NextResponse.json(
        {
          ok: false,
          error: "invalid_payload",
          code: "invalid_payload",
          message: "Song Architect input did not pass validation."
        },
        { status: 400 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const inputPayload: SongArchitectInput = {
      preset: parsed.data.preset,
      genre: parsed.data.genre,
      theme: parsed.data.theme,
      angle: parsed.data.angle,
      emotion: parsed.data.emotion,
      hookIdentity: parsed.data.hookIdentity,
      structure: parsed.data.structure,
      energyCurve: parsed.data.energyCurve,
      language: parsed.data.language,
      vocalStyle: parsed.data.vocalStyle,
      lineDensity: parsed.data.lineDensity,
      referenceArtists: parsed.data.referenceArtists,
      mustInclude: parsed.data.mustInclude,
      avoidWords: parsed.data.avoidWords,
      userNotes: parsed.data.userNotes
    };

    const hasMeaningfulInput = Object.values(inputPayload).some((value) => {
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined;
    });
    if (!hasMeaningfulInput) {
      const res = NextResponse.json(
        {
          ok: false,
          error: "empty_payload",
          code: "empty_payload",
          message: "Song Architect input payload cannot be empty."
        },
        { status: 400 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const access = await resolveSongArchitectVerifiedContext({
      request,
      sessionId: sessionPrep.sessionId,
      billingEmailHint: parsed.data.billingEmail
    });
    if (!access.ok) {
      const res = NextResponse.json(
        {
          ok: false,
          code: access.code,
          message: access.message
        },
        { status: 403 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    const trustedAccess = access;
    if (!hasTrustedEmailAccess(request, trustedAccess.normalizedEmail)) {
      logAbuseGuard("unverified_song_architect_output_blocked", {
        endpoint: "/api/song-architect/generate",
        ipHash: hashIdentifier(clientIp),
        emailHash: hashIdentifier(trustedAccess.normalizedEmail)
      });
      const res = NextResponse.json(
        {
          ok: false,
          code: "email_verification_required",
          message: "Please confirm email access before generating Song Architect output."
        },
        { status: 403 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    const generateEmailRate = consumeRateLimit({
      bucket: "song_architect_generate_email",
      key: trustedAccess.normalizedEmail,
      limit: 10,
      windowMs: 60 * 60 * 1000
    });
    if (!generateEmailRate.allowed) {
      logAbuseGuard("rate_limited", {
        endpoint: "/api/song-architect/generate",
        bucket: "song_architect_generate_email",
        ipHash: hashIdentifier(clientIp),
        emailHash: hashIdentifier(trustedAccess.normalizedEmail),
        retryAfterSec: generateEmailRate.retryAfterSec
      });
      const res = tooManyAttemptsResponse(generateEmailRate.retryAfterSec);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    console.info("[song-architect] usage_before_generation", {
      sessionId: sessionPrep.sessionId,
      normalizedEmail: trustedAccess.normalizedEmail,
      planId: trustedAccess.usage.planId,
      used: trustedAccess.usage.used,
      limit: trustedAccess.usage.limit,
      remaining: trustedAccess.usage.remaining
    });

    if (trustedAccess.usage.remaining <= 0) {
      const isFree = trustedAccess.usage.planId === "free";
      const res = NextResponse.json(
        {
          ok: false,
          code: "song_architect_quota_reached",
          message: isFree
            ? "You’ve used your free Song Architect blueprint for this month."
            : "You’ve used all Song Architect blueprints for this month.",
          usage: trustedAccess.usage
        },
        { status: 403 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    let openAiResult: {
      outputText: string;
      model: string;
      presetUsed?: string;
      resolvedInput: SongArchitectResolvedInput;
    };
    openAiResult = await requestSongArchitectFromOpenAI(inputPayload);
    logDebug("openai_response_received", {
      outputPreview: openAiResult.outputText.slice(0, 800),
      outputLength: openAiResult.outputText.length
    });
    let normalized;
    try {
      normalized = normalizeSongArchitectOutput({
        rawOutputText: openAiResult.outputText,
        model: openAiResult.model,
        generatedAt: new Date().toISOString(),
        presetUsed: openAiResult.presetUsed,
        resolvedInput: openAiResult.resolvedInput,
        log: (event, payload) => logDebug(event, payload)
      });
    } catch (error) {
      logDebug("normalize_failed", {
        elapsedMs: Date.now() - requestStartedAt,
        error: error instanceof Error ? error.message : String(error),
        rawPreview: openAiResult.outputText.slice(0, 300)
      });
      throw new SongArchitectOpenAIError(
        "invalid_json",
        error instanceof Error ? error.message : "Song Architect returned invalid JSON output."
      );
    }

    logDebug("request_success", {
      elapsedMs: Date.now() - requestStartedAt
    });
    const usagePlanId = trustedAccess.usage.planId ?? "free";
    if (!trustedAccess.usage.planId) {
      console.warn("[song-architect] verified_usage_missing_plan_id_fallback", {
        sessionId: sessionPrep.sessionId,
        normalizedEmail: trustedAccess.normalizedEmail,
        fallbackPlanId: usagePlanId
      });
    }
    await recordSongArchitectGenerationEvent({
      normalizedEmail: trustedAccess.normalizedEmail,
      planId: usagePlanId,
      presetUsed: openAiResult.presetUsed ?? inputPayload.preset,
      genre: openAiResult.resolvedInput.genre,
      theme: openAiResult.resolvedInput.theme,
      status: "success",
      counted: true
    });
    const nextUsage = {
      ...trustedAccess.usage,
      used: trustedAccess.usage.used + 1,
      remaining: Math.max(trustedAccess.usage.remaining - 1, 0)
    };
    const res = NextResponse.json(
      {
        ok: true,
        data: normalized,
        usage: nextUsage
      },
      { status: 200 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    if (error instanceof SongArchitectOpenAIError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[song-architect] openai_error", {
          code: error.code,
          message: error.message
        });
      }
      const res = NextResponse.json(
        {
          ok: false,
          error: "song_architect_unavailable",
          code: "song_architect_unavailable",
          message: "Song Architect generation is temporarily unavailable. Please retry.",
          detail: error.code
        },
        { status: error.code === "rate_limit" ? 429 : 503 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    if (process.env.NODE_ENV !== "production") {
      console.error("[song-architect] generation_failed", error instanceof Error ? error.message : error);
    }

    const res = NextResponse.json(
      {
        ok: false,
        error: "song_architect_generation_failed",
        code: "song_architect_generation_failed",
        message: "Song Architect generation failed."
      },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
