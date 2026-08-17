import { z } from "zod";
import type { SpotifyTrackMetadata } from "@/lib/song-architect/spotify-metadata";
import type {
  ReferenceCharacteristics,
  ReferenceDNA,
  ReferenceSource,
  SongArchitectInput,
  SongArchitectResolvedInput,
  SongArchitectSonicControls,
  SonicDNA
} from "@/lib/song-architect/types";

/**
 * Provenance stays split on purpose:
 * - metadata_reference_interpretation: Spotify metadata + model interpretation. No audio was analyzed.
 * - measured_audio_analysis: future Phase 2 only (user-uploaded legally obtained audio + internal DSP).
 * Do not collapse these into a generic "analysis" type. Measured fields should later supersede
 * inferred fields without rewriting this feature.
 */
export const REFERENCE_STYLE_ANALYSIS_METADATA = "metadata_reference_interpretation" as const;
export const REFERENCE_STYLE_ANALYSIS_MEASURED = "measured_audio_analysis" as const;

export type ReferenceStyleAnalysisType =
  | typeof REFERENCE_STYLE_ANALYSIS_METADATA
  | typeof REFERENCE_STYLE_ANALYSIS_MEASURED;

export const REFERENCE_STYLE_DISCLAIMER =
  "Reference-based interpretation. MasterSauce has not analyzed the Spotify audio.";

export type ReferenceStyleBlueprint = {
  source: {
    provider: "spotify";
    trackId: string;
    title: string;
    artists: string[];
    album?: string;
    artworkUrl?: string;
    durationMs?: number;
    spotifyUrl?: string;
  };
  interpretation: {
    genreDirection: string[];
    mood: string[];
    energy: number | null;
    darknessBrightness: number | null;
    organicElectronicBalance: number | null;
    heaviness: number | null;
    rhythmicCharacter: string[];
    vocalCharacter: string[];
    productionPalette: string[];
    arrangementDirection: string[];
    likelyTempoRange: { min: number; max: number } | null;
    likelyTonalCharacter: string | null;
    creativeSummary: string;
  };
  provenance: {
    analysisType: typeof REFERENCE_STYLE_ANALYSIS_METADATA;
    directlyAnalyzedAudio: false;
    disclaimer: string;
  };
};

export type ReferenceStyleGuidance = Pick<
  SongArchitectInput,
  "genre" | "emotion" | "vocalStyle" | "structure" | "energyCurve"
>;

export class ReferenceStyleBlueprintError extends Error {
  constructor(
    public readonly code: "missing_api_key" | "timeout" | "http_error" | "invalid_json" | "empty_output" | "rate_limit",
    message: string
  ) {
    super(message);
    this.name = "ReferenceStyleBlueprintError";
  }
}

const STRING_LIST_MAX = 8;
const STRING_ITEM_MAX = 80;
const SUMMARY_MAX = 420;
const TONAL_MAX = 80;
const MIN_TEMPO_SPAN = 8;

function uniqueStrings(values: Array<string | undefined>, maxItems: number, itemMax: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const clipped = trimmed.slice(0, itemMax);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= maxItems) break;
  }
  return out;
}

function sanitizeStringList(value: unknown, maxItems = STRING_LIST_MAX, itemMax = STRING_ITEM_MAX): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value.map((item) => (typeof item === "string" ? item : undefined)),
    maxItems,
    itemMax
  );
}

function sanitizeOptionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function clampScale(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function looksLikeExactConcertKey(value: string): boolean {
  return /^[A-G](?:#|b|♯|♭)?\s*(?:major|minor|maj|min|m)$/i.test(value.trim());
}

function softenTonalCharacter(value: string | null): string | null {
  if (!value) return null;
  if (looksLikeExactConcertKey(value)) {
    return /minor|\bm\b/i.test(value) ? "minor-leaning" : "major-leaning";
  }
  if (/\b\d+(?:\.\d+)?\s*hz\b/i.test(value) || /\bkey:\s*[A-G]/i.test(value)) {
    return null;
  }
  return value.slice(0, TONAL_MAX);
}

function sanitizeTempoRange(value: unknown): { min: number; max: number } | null {
  if (!value || typeof value !== "object") return null;
  const minRaw = (value as { min?: unknown }).min;
  const maxRaw = (value as { max?: unknown }).max;
  if (typeof minRaw !== "number" || typeof maxRaw !== "number") return null;
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return null;
  const min = Math.round(minRaw);
  const max = Math.round(maxRaw);
  if (min < 40 || max > 240 || min >= max) return null;
  if (max - min < MIN_TEMPO_SPAN) return null;
  return { min, max };
}

function formatLikelyTempoFeel(range: { min: number; max: number }): string {
  const mid = (range.min + range.max) / 2;
  const band = mid < 85 ? "slow" : mid < 110 ? "mid-tempo" : mid < 140 ? "uptempo" : "fast";
  return `${band} feel, approximately ${range.min}–${range.max} BPM`;
}

function energyCurveFromScale(energy: number | null, arrangement: string[]): string | undefined {
  if (energy === null && arrangement.length === 0) return undefined;
  if (energy === null) {
    return `inspired arrangement feel: ${arrangement.slice(0, 4).join(", ")}`;
  }
  if (energy <= 35) return "restrained start with a controlled lift";
  if (energy <= 65) return "mid-energy arc with a clear chorus lift";
  return "high-energy lift with a strong final peak";
}

function structureFromArrangement(arrangement: string[]): string | undefined {
  if (arrangement.length === 0) return undefined;
  const sectionLike = arrangement.filter((item) =>
    /\b(intro|verse|pre[-\s]?chorus|chorus|hook|drop|bridge|breakdown|outro|final)\b/i.test(item)
  );
  if (sectionLike.length < 2) return undefined;
  if (sectionLike.some((item) => item.length > 40)) return undefined;
  return sectionLike.slice(0, 10).join(" > ").slice(0, 220);
}

export function createReferenceStyleProvenance(): ReferenceStyleBlueprint["provenance"] {
  return {
    analysisType: REFERENCE_STYLE_ANALYSIS_METADATA,
    directlyAnalyzedAudio: false,
    disclaimer: REFERENCE_STYLE_DISCLAIMER
  };
}

export function normalizeReferenceStyleBlueprint(raw: unknown, fallbackTrack?: SpotifyTrackMetadata): ReferenceStyleBlueprint | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const sourceRaw = (raw as { source?: unknown }).source;
  const interpretationRaw = (raw as { interpretation?: unknown }).interpretation;
  const sourceObj = sourceRaw && typeof sourceRaw === "object" ? (sourceRaw as Record<string, unknown>) : {};
  const interpretationObj =
    interpretationRaw && typeof interpretationRaw === "object" ? (interpretationRaw as Record<string, unknown>) : {};

  const trackId =
    sanitizeOptionalText(sourceObj.trackId, 22) ??
    fallbackTrack?.id ??
    "";
  const title = sanitizeOptionalText(sourceObj.title, 180) ?? fallbackTrack?.title ?? "";
  const artists = sanitizeStringList(sourceObj.artists, 8, 80);
  const resolvedArtists = artists.length > 0 ? artists : fallbackTrack?.artists ?? [];
  if (!trackId || !title || resolvedArtists.length === 0) return null;

  const album = sanitizeOptionalText(sourceObj.album, 160) ?? fallbackTrack?.album;
  const artworkUrl = sanitizeOptionalText(sourceObj.artworkUrl, 500) ?? fallbackTrack?.artworkUrl;
  const durationMs =
    typeof sourceObj.durationMs === "number" && Number.isFinite(sourceObj.durationMs)
      ? Math.max(0, Math.round(sourceObj.durationMs))
      : fallbackTrack?.durationMs;
  const spotifyUrl = sanitizeOptionalText(sourceObj.spotifyUrl, 300) ?? fallbackTrack?.url;
  const creativeSummary =
    sanitizeOptionalText(interpretationObj.creativeSummary, SUMMARY_MAX) ??
    "Original production direction inspired by the reference's musical characteristics.";

  return {
    source: {
      provider: "spotify",
      trackId,
      title,
      artists: resolvedArtists,
      ...(album ? { album } : {}),
      ...(artworkUrl ? { artworkUrl } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(spotifyUrl ? { spotifyUrl } : {})
    },
    interpretation: {
      genreDirection: sanitizeStringList(interpretationObj.genreDirection, 6, 40),
      mood: sanitizeStringList(interpretationObj.mood, 6, 40),
      energy: clampScale(interpretationObj.energy),
      darknessBrightness: clampScale(interpretationObj.darknessBrightness),
      organicElectronicBalance: clampScale(interpretationObj.organicElectronicBalance),
      heaviness: clampScale(interpretationObj.heaviness),
      rhythmicCharacter: sanitizeStringList(interpretationObj.rhythmicCharacter),
      vocalCharacter: sanitizeStringList(interpretationObj.vocalCharacter),
      productionPalette: sanitizeStringList(interpretationObj.productionPalette),
      arrangementDirection: sanitizeStringList(interpretationObj.arrangementDirection),
      likelyTempoRange: sanitizeTempoRange(interpretationObj.likelyTempoRange),
      likelyTonalCharacter: softenTonalCharacter(sanitizeOptionalText(interpretationObj.likelyTonalCharacter, TONAL_MAX) ?? null),
      creativeSummary
    },
    provenance: createReferenceStyleProvenance()
  };
}

export const ReferenceStyleBlueprintSchema = z
  .object({
    source: z.object({
      provider: z.literal("spotify"),
      trackId: z.string().trim().min(1).max(22),
      title: z.string().trim().min(1).max(180),
      artists: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
      album: z.string().trim().min(1).max(160).optional(),
      artworkUrl: z.string().trim().min(1).max(500).optional(),
      durationMs: z.number().int().min(0).max(86_400_000).optional(),
      spotifyUrl: z.string().trim().min(1).max(300).optional()
    }),
    interpretation: z.object({
      genreDirection: z.array(z.string().trim().min(1).max(40)).max(6),
      mood: z.array(z.string().trim().min(1).max(40)).max(6),
      energy: z.number().int().min(0).max(100).nullable(),
      darknessBrightness: z.number().int().min(0).max(100).nullable(),
      organicElectronicBalance: z.number().int().min(0).max(100).nullable(),
      heaviness: z.number().int().min(0).max(100).nullable(),
      rhythmicCharacter: z.array(z.string().trim().min(1).max(80)).max(8),
      vocalCharacter: z.array(z.string().trim().min(1).max(80)).max(8),
      productionPalette: z.array(z.string().trim().min(1).max(80)).max(8),
      arrangementDirection: z.array(z.string().trim().min(1).max(80)).max(8),
      likelyTempoRange: z
        .object({
          min: z.number().int().min(40).max(240),
          max: z.number().int().min(40).max(240)
        })
        .nullable(),
      likelyTonalCharacter: z.string().trim().min(1).max(80).nullable(),
      creativeSummary: z.string().trim().min(1).max(SUMMARY_MAX)
    }),
    provenance: z.object({
      analysisType: z.literal(REFERENCE_STYLE_ANALYSIS_METADATA),
      directlyAnalyzedAudio: z.literal(false),
      disclaimer: z.string().trim().min(1).max(240)
    })
  })
  .transform((value) => normalizeReferenceStyleBlueprint(value))
  .refine((value): value is ReferenceStyleBlueprint => Boolean(value));

export function deriveSongArchitectGuidanceFromBlueprint(blueprint: ReferenceStyleBlueprint): ReferenceStyleGuidance {
  const interpretation = blueprint.interpretation;
  const genre = interpretation.genreDirection[0];
  const emotion = interpretation.mood.slice(0, 3).join(", ") || undefined;
  const vocalStyle = interpretation.vocalCharacter.slice(0, 3).join(", ") || undefined;
  const structure = structureFromArrangement(interpretation.arrangementDirection);
  const energyCurve = energyCurveFromScale(interpretation.energy, interpretation.arrangementDirection);
  return {
    ...(genre ? { genre: genre.slice(0, 40) } : {}),
    ...(emotion ? { emotion: emotion.slice(0, 100) } : {}),
    ...(vocalStyle ? { vocalStyle: vocalStyle.slice(0, 140) } : {}),
    ...(structure ? { structure } : {}),
    ...(energyCurve ? { energyCurve: energyCurve.slice(0, 180) } : {})
  };
}

function toCharacteristics(interpretation: ReferenceStyleBlueprint["interpretation"]): ReferenceCharacteristics {
  return {
    ...(interpretation.genreDirection[0] ? { genreLineage: interpretation.genreDirection[0] } : {}),
    ...(interpretation.genreDirection.length > 1 ? { subgenreTendencies: interpretation.genreDirection.slice(1) } : {}),
    ...(interpretation.likelyTempoRange ? { tempoTendencies: formatLikelyTempoFeel(interpretation.likelyTempoRange) } : {}),
    ...(interpretation.rhythmicCharacter[0] ? { groove: interpretation.rhythmicCharacter[0] } : {}),
    ...(interpretation.rhythmicCharacter[1] ? { drumCharacter: interpretation.rhythmicCharacter[1] } : {}),
    ...(interpretation.productionPalette[1] ? { bassCharacter: interpretation.productionPalette[1] } : {}),
    ...(interpretation.productionPalette.length > 0 ? { instrumentation: interpretation.productionPalette.slice(0, 4) } : {}),
    ...(interpretation.vocalCharacter[0] ? { vocalDelivery: interpretation.vocalCharacter[0] } : {}),
    ...(interpretation.vocalCharacter[1] ? { vocalTexture: interpretation.vocalCharacter[1] } : {}),
    ...(interpretation.vocalCharacter[2] ? { vocalLayering: interpretation.vocalCharacter[2] } : {}),
    ...(interpretation.likelyTonalCharacter ? { harmonicTendencies: interpretation.likelyTonalCharacter } : {}),
    ...(interpretation.arrangementDirection[0] ? { arrangementTendencies: interpretation.arrangementDirection[0] } : {}),
    ...(interpretation.productionPalette[0] ? { mixAesthetic: interpretation.productionPalette[0] } : {}),
    ...(interpretation.mood[0] ? { energyBehavior: interpretation.mood[0] } : {})
  };
}

export function referenceDNAFromBlueprint(blueprint: ReferenceStyleBlueprint): ReferenceDNA {
  const source: ReferenceSource = { type: "artist_dna", label: "reference style characteristics" };
  const characteristics = toCharacteristics(blueprint.interpretation);
  const complementaryTraits = (Object.entries(characteristics) as Array<[keyof ReferenceCharacteristics, string | string[] | undefined]>)
    .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : Boolean(value)))
    .slice(0, 10)
    .map(([field, value]) => ({
      field,
      value: Array.isArray(value) ? value.join(", ") : value ?? "",
      confidence: "likely" as const,
      role: "complementary" as const,
      sources: [] as string[]
    }))
    .filter((trait) => trait.value.trim().length > 0);

  return {
    sources: [source],
    profiles: [
      {
        source,
        characteristics,
        confidence: "likely",
        catalogMatch: true
      }
    ],
    sharedTraits: [],
    complementaryTraits,
    conflictingTraits: [],
    influenceSummary:
      "Reference Style Blueprint characteristics informed the sonic direction. This is a metadata interpretation, not measured audio. The result is an original direction, not a recreation of a specific recording."
  };
}

export function mergeReferenceDNA(base?: ReferenceDNA, extra?: ReferenceDNA): ReferenceDNA | undefined {
  if (!base) return extra;
  if (!extra) return base;
  return {
    sources: [...base.sources, ...extra.sources].slice(0, 8),
    profiles: [...base.profiles, ...extra.profiles].slice(0, 8),
    sharedTraits: [...base.sharedTraits, ...extra.sharedTraits],
    complementaryTraits: [...base.complementaryTraits, ...extra.complementaryTraits],
    conflictingTraits: [...base.conflictingTraits, ...extra.conflictingTraits],
    influenceSummary: `${base.influenceSummary} ${extra.influenceSummary}`.trim()
  };
}

export function overlayBlueprintTempoOnSonic(
  sonic: SonicDNA,
  blueprint: ReferenceStyleBlueprint | undefined,
  userOverrides: Array<keyof SongArchitectSonicControls>
): SonicDNA {
  if (!blueprint?.interpretation.likelyTempoRange) return sonic;
  if (userOverrides.includes("bpm")) return sonic;
  const range = blueprint.interpretation.likelyTempoRange;
  const next: SonicDNA = {
    ...sonic,
    bpmRange: range,
    tempoFeel: sonic.tempoFeel ?? formatLikelyTempoFeel(range)
  };
  delete next.bpm;
  return next;
}

export function formatReferenceStyleGuidanceForPrompt(blueprint?: ReferenceStyleBlueprint): string | undefined {
  if (!blueprint) return undefined;
  const interpretation = blueprint.interpretation;
  const parts = uniqueStrings(
    [
      ...interpretation.genreDirection,
      ...interpretation.mood,
      ...interpretation.productionPalette,
      ...interpretation.rhythmicCharacter,
      ...interpretation.vocalCharacter,
      ...interpretation.arrangementDirection,
      interpretation.likelyTempoRange ? formatLikelyTempoFeel(interpretation.likelyTempoRange) : undefined,
      interpretation.likelyTonalCharacter ?? undefined,
      interpretation.creativeSummary
    ],
    12,
    120
  );
  if (parts.length === 0) return undefined;
  return `Reference Style Blueprint characteristics (metadata interpretation, not measured audio; create something original, do not recreate a specific recording): ${parts.join("; ")}`;
}

export function formatLikelyTempoLabel(blueprint: ReferenceStyleBlueprint): string | null {
  if (!blueprint.interpretation.likelyTempoRange) return null;
  return formatLikelyTempoFeel(blueprint.interpretation.likelyTempoRange);
}

export function buildReferenceStyleSystemPrompt(): string {
  return `You are MasterSauce Song Architect's Reference Style interpreter.
Turn public track metadata and generally known stylistic characteristics into a structured Style Blueprint for an ORIGINAL song.

Hard rules:
- You have not listened to the audio. Never claim you analyzed, heard, ripped, downloaded, or measured the recording.
- Do not fabricate acoustic measurements: no exact BPM, concert key, LUFS, true peak, stereo width, spectral balance, or section timestamps.
- Distinguish estimates from measurements. Inferred fields may be null when you are not reasonably confident.
- Convert recognizable stylistic characteristics into descriptive production language that can inspire an original composition.
- Do not reproduce copyrighted lyrics or quote distinctive lyric lines.
- Do not tell the user to clone, copy, duplicate, or recreate the specific recording.
- Do not output artist or song names inside interpretation fields. Keep those only in the provided source metadata echo if needed; interpretation must be characteristic-based.
- Energy, darkness/brightness, organic/electronic balance, and heaviness are 0-100 inferred feel scores, not loudness measurements.
- likelyTempoRange must be a broad integer range (at least 8 BPM wide), or null.
- likelyTonalCharacter must be descriptive (for example "minor-leaning nocturnal pop"), never an exact concert key.
- creativeSummary should explain why the reference works musically and how those traits can become an original production direction.

Return JSON only.`;
}

export function buildReferenceStyleUserPrompt(track: SpotifyTrackMetadata): string {
  return JSON.stringify(
    {
      requestType: "reference_style_blueprint",
      analysisType: REFERENCE_STYLE_ANALYSIS_METADATA,
      directlyAnalyzedAudio: false,
      track: {
        title: track.title,
        artists: track.artists,
        album: track.album ?? null,
        durationMs: track.durationMs
      },
      outputContract: {
        interpretationKeys: [
          "genreDirection",
          "mood",
          "energy",
          "darknessBrightness",
          "organicElectronicBalance",
          "heaviness",
          "rhythmicCharacter",
          "vocalCharacter",
          "productionPalette",
          "arrangementDirection",
          "likelyTempoRange",
          "likelyTonalCharacter",
          "creativeSummary"
        ]
      }
    },
    null,
    2
  );
}

const OPENAI_BLUEPRINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["interpretation"],
  properties: {
    interpretation: {
      type: "object",
      additionalProperties: false,
      required: [
        "genreDirection",
        "mood",
        "energy",
        "darknessBrightness",
        "organicElectronicBalance",
        "heaviness",
        "rhythmicCharacter",
        "vocalCharacter",
        "productionPalette",
        "arrangementDirection",
        "likelyTempoRange",
        "likelyTonalCharacter",
        "creativeSummary"
      ],
      properties: {
        genreDirection: { type: "array", maxItems: 6, items: { type: "string", minLength: 1, maxLength: 40 } },
        mood: { type: "array", maxItems: 6, items: { type: "string", minLength: 1, maxLength: 40 } },
        energy: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        darknessBrightness: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        organicElectronicBalance: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        heaviness: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        rhythmicCharacter: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 80 } },
        vocalCharacter: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 80 } },
        productionPalette: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 80 } },
        arrangementDirection: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 80 } },
        likelyTempoRange: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["min", "max"],
              properties: {
                min: { type: "integer", minimum: 40, maximum: 240 },
                max: { type: "integer", minimum: 40, maximum: 240 }
              }
            },
            { type: "null" }
          ]
        },
        likelyTonalCharacter: { type: ["string", "null"], maxLength: 80 },
        creativeSummary: { type: "string", minLength: 1, maxLength: SUMMARY_MAX }
      }
    }
  }
} as const;

export async function generateReferenceStyleBlueprint(args: {
  track: SpotifyTrackMetadata;
  completeJson?: (systemText: string, userText: string) => Promise<unknown>;
}): Promise<ReferenceStyleBlueprint> {
  const completeJson = args.completeJson ?? defaultCompleteJson;
  const raw = await completeJson(buildReferenceStyleSystemPrompt(), buildReferenceStyleUserPrompt(args.track));
  const normalized = normalizeReferenceStyleBlueprint(raw, args.track);
  if (!normalized) {
    throw new ReferenceStyleBlueprintError("invalid_json", "Reference Style Blueprint generation returned invalid output.");
  }
  return normalized;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function defaultCompleteJson(systemText: string, userText: string): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new ReferenceStyleBlueprintError("missing_api_key", "OPENAI_API_KEY is not configured.");
  }
  const model = process.env.OPENAI_SONG_ARCHITECT_MODEL?.trim() || "gpt-5-mini";
  const timeoutMsRaw = Number(process.env.OPENAI_SONG_ARCHITECT_TIMEOUT_MS ?? "25000");
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.min(Math.max(timeoutMsRaw, 3000), 60000) : 25000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: systemText }] },
          { role: "user", content: [{ type: "input_text", text: userText }] }
        ],
        max_output_tokens: 1400,
        reasoning: { effort: process.env.OPENAI_SONG_ARCHITECT_REASONING_EFFORT?.trim() || "low" },
        text: {
          format: {
            type: "json_schema",
            name: "reference_style_blueprint",
            strict: true,
            schema: OPENAI_BLUEPRINT_SCHEMA
          }
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      const lower = errText.toLowerCase();
      if (response.status === 429 || lower.includes("rate limit")) {
        throw new ReferenceStyleBlueprintError("rate_limit", "OpenAI rate limit.");
      }
      throw new ReferenceStyleBlueprintError("http_error", `OpenAI error ${response.status}`);
    }

    const payload = (await response.json()) as {
      output_text?: string | null;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    const outputText =
      (typeof payload.output_text === "string" && payload.output_text.trim() ? payload.output_text : null) ??
      payload.output
        ?.flatMap((entry) => entry.content ?? [])
        .find((item) => item?.type === "output_text" && typeof item.text === "string" && item.text.trim())?.text ??
      null;
    if (!outputText) {
      throw new ReferenceStyleBlueprintError("empty_output", "OpenAI returned no usable output.");
    }
    const parsed = parseJsonObject(outputText);
    if (!parsed) {
      throw new ReferenceStyleBlueprintError("invalid_json", "OpenAI returned invalid JSON.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof ReferenceStyleBlueprintError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ReferenceStyleBlueprintError("timeout", `Reference Style Blueprint timed out after ${timeoutMs}ms.`);
    }
    throw new ReferenceStyleBlueprintError("http_error", error instanceof Error ? error.message : "Unknown OpenAI error.");
  } finally {
    clearTimeout(timer);
  }
}

export function applyReferenceStyleGuidance(args: {
  defaults: SongArchitectResolvedInput;
  presetDefaults?: Partial<SongArchitectResolvedInput>;
  explicit: SongArchitectInput;
  blueprint?: ReferenceStyleBlueprint;
}): {
  genre?: string;
  emotion?: string;
  vocalStyle?: string;
  structure?: string;
  energyCurve?: string;
  sonicControls: SongArchitectSonicControls;
} {
  const guidance = args.blueprint ? deriveSongArchitectGuidanceFromBlueprint(args.blueprint) : {};
  const pick = <K extends "genre" | "emotion" | "vocalStyle" | "structure" | "energyCurve">(
    key: K,
    sanitize: (value: string | undefined) => string | undefined
  ): string | undefined => {
    return sanitize(args.explicit[key]) ?? args.presetDefaults?.[key] ?? guidance[key] ?? args.defaults[key];
  };

  return {
    genre: pick("genre", (value) => sanitizeOptionalText(value, 40)),
    emotion: pick("emotion", (value) => sanitizeOptionalText(value, 100)),
    vocalStyle: pick("vocalStyle", (value) => sanitizeOptionalText(value, 140)),
    structure: pick("structure", (value) => sanitizeOptionalText(value, 220)),
    energyCurve: pick("energyCurve", (value) => sanitizeOptionalText(value, 180)),
    sonicControls: {
      ...sanitizeOptionalSonic(args.presetDefaults?.sonicControls),
      ...sanitizeOptionalSonic(args.explicit.sonicControls)
    }
  };
}

function sanitizeOptionalSonic(value: SongArchitectSonicControls | undefined): SongArchitectSonicControls {
  if (!value) return {};
  return {
    ...(typeof value.bpm === "number" && Number.isFinite(value.bpm)
      ? { bpm: Math.min(240, Math.max(40, Math.round(value.bpm))) }
      : {}),
    ...(sanitizeOptionalText(value.groove, 80) ? { groove: sanitizeOptionalText(value.groove, 80) } : {}),
    ...(sanitizeOptionalText(value.instrumentFocus, 80)
      ? { instrumentFocus: sanitizeOptionalText(value.instrumentFocus, 80) }
      : {}),
    ...(sanitizeOptionalText(value.productionEra, 60) ? { productionEra: sanitizeOptionalText(value.productionEra, 60) } : {}),
    ...(sanitizeOptionalText(value.productionTexture, 80)
      ? { productionTexture: sanitizeOptionalText(value.productionTexture, 80) }
      : {})
  };
}
