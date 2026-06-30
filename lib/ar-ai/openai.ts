import { AR_AI_OPENAI_RESPONSE_SCHEMA } from "@/lib/ar-ai/schema";
import { buildArAiSystemPrompt, buildArAiUserPrompt } from "@/lib/ar-ai/prompts";
import type { ArAiEvaluationInput } from "@/lib/ar-ai/types";

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TIMEOUT_MS = 120000;
const DEFAULT_MAX_OUTPUT_TOKENS = 12000;
const AR_AI_DEBUG = process.env.AR_AI_DEBUG === "1";

export class ArAiOpenAIError extends Error {
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
    this.name = "ArAiOpenAIError";
  }
}

function logDebug(event: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production" || AR_AI_DEBUG) {
    console.info("[ar-ai] debug", { event, ...payload });
  }
}

export async function requestArAiEvaluationFromOpenAI(input: ArAiEvaluationInput): Promise<{
  rawOutput: unknown;
  model: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new ArAiOpenAIError("missing_api_key", "OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_AR_AI_MODEL?.trim() || process.env.OPENAI_SONG_ARCHITECT_MODEL?.trim() || "gpt-5-mini";
  const timeoutMsRaw = Number(process.env.OPENAI_AR_AI_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`);
  const timeoutMs = Number.isFinite(timeoutMsRaw)
    ? Math.min(Math.max(timeoutMsRaw, 5000), MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  const reasoningEffort = process.env.OPENAI_AR_AI_REASONING_EFFORT?.trim() || "low";

  async function callOpenAI(attempt: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const body: Record<string, unknown> = {
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: buildArAiSystemPrompt() }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: buildArAiUserPrompt(input) }]
          }
        ],
        max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
        text: {
          format: {
            type: "json_schema",
            name: "mastersauce_ar_ai_report",
            strict: true,
            schema: AR_AI_OPENAI_RESPONSE_SCHEMA
          }
        }
      };

      if (reasoningEffort) {
        body.reasoning = { effort: reasoningEffort };
      }

      logDebug("openai_request_start", { attempt, model, timeoutMs });

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const errorText = await response.text();
      if (!response.ok) {
        if (response.status === 429) {
          throw new ArAiOpenAIError("rate_limit", `OpenAI rate limit: ${errorText.slice(0, 400)}`);
        }
        if (response.status === 400 && /token|context|length/i.test(errorText)) {
          throw new ArAiOpenAIError("token_limit", `OpenAI context/token limit: ${errorText.slice(0, 400)}`);
        }
        if (response.status === 400 && /model|reasoning/i.test(errorText)) {
          throw new ArAiOpenAIError("invalid_model", `OpenAI model configuration error: ${errorText.slice(0, 400)}`);
        }
        throw new ArAiOpenAIError("http_error", `OpenAI error ${response.status}: ${errorText.slice(0, 500)}`);
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(errorText) as Record<string, unknown>;
      } catch {
        throw new ArAiOpenAIError("invalid_json", "OpenAI returned non-JSON response.");
      }

      const outputText = extractOutputText(parsed);
      if (!outputText) {
        throw new ArAiOpenAIError("empty_output", "OpenAI returned no usable output.");
      }

      logDebug("openai_request_success", {
        attempt,
        elapsedMs: Date.now() - startedAt,
        outputLength: outputText.length
      });

      return outputText;
    } catch (error) {
      if (error instanceof ArAiOpenAIError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new ArAiOpenAIError("timeout", `A&R AI timed out after ${timeoutMs}ms.`);
      }
      throw new ArAiOpenAIError("http_error", error instanceof Error ? error.message : "Unknown OpenAI error.");
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const outputText = await callOpenAI(1);
    return { rawOutput: JSON.parse(outputText), model };
  } catch (error) {
    if (error instanceof ArAiOpenAIError && (error.code === "timeout" || error.code === "token_limit")) {
      const outputText = await callOpenAI(2);
      return { rawOutput: JSON.parse(outputText), model };
    }
    if (error instanceof SyntaxError) {
      throw new ArAiOpenAIError("invalid_json", "OpenAI structured output was not valid JSON.");
    }
    throw error;
  }
}

function extractOutputText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    return null;
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const typed = part as { type?: string; text?: string };
      if ((typed.type === "output_text" || typed.type === "text") && typeof typed.text === "string") {
        chunks.push(typed.text);
      }
    }
  }

  const joined = chunks.join("").trim();
  return joined || null;
}
