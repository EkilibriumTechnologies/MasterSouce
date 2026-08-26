import { z } from "zod";
import type { SongDNA } from "@/lib/song-architect/types";

export const GENERATION_MATCH_SONG_DNA_MAX_BYTES = 100_000;
export const GENERATION_MATCH_RESULT_ID_MAX_LENGTH = 128;

export type GenerationMatchRequestError = {
  ok: false;
  code:
    | "missing_song_architect_reference"
    | "invalid_song_architect_reference"
    | "song_architect_result_not_found"
    | "ownership_rejected"
    | "ownership_mismatch";
  message: string;
};

export type GenerationMatchClaimedIdentity = {
  ownerEmail?: string;
  ownerId?: string;
  userId?: string;
  resultId?: string;
  sessionId?: string;
};

const GENRE_FAMILY = z.enum([
  "edm",
  "hip-hop",
  "nu-metal",
  "pop",
  "acoustic",
  "reggaeton",
  "rock",
  "rnb",
  "ballad",
  "generic"
]);

const CompositionSchema = z
  .object({
    theme: z.string(),
    angle: z.string(),
    emotionalIntent: z.string(),
    hookIdentity: z.string(),
    lyricalPerspective: z.string(),
    language: z.string(),
    structure: z.string(),
    runtime: z.string(),
    lineDensity: z.enum(["sparse", "balanced", "dense"]),
    vocalStyle: z.string(),
    mustInclude: z.array(z.string()),
    avoidWords: z.array(z.string()),
    energyCurve: z.string()
  })
  .passthrough();

const SonicSchema = z
  .object({
    bpm: z.number().finite().optional(),
    bpmRange: z
      .object({
        min: z.number().finite(),
        max: z.number().finite()
      })
      .optional(),
    productionAesthetic: z.string().optional(),
    emotionalSonicExpression: z.string().optional(),
    ambience: z.string().optional(),
    distortionSaturation: z.string().optional(),
    bassCharacter: z.string().optional(),
    dynamics: z.string().optional(),
    spatialCharacter: z.string().optional(),
    vocalRegister: z.string().optional(),
    vocalTexture: z.string().optional(),
    vocalDelivery: z.string().optional()
  })
  .passthrough();

const ArrangementSectionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    sectionType: z.string().min(1),
    energy: z.number().finite().optional(),
    spatialDirection: z.string().optional()
  })
  .passthrough();

const SongDNASchema = z
  .object({
    composition: CompositionSchema,
    sonic: SonicSchema,
    arrangement: z
      .object({
        sections: z.array(ArrangementSectionSchema),
        globalArc: z.string().optional()
      })
      .passthrough()
      .optional(),
    harmony: z.object({}).passthrough().optional(),
    meta: z
      .object({
        genreFamily: GENRE_FAMILY,
        inferenceMode: z.enum(["automatic", "mixed"]),
        userOverrides: z.array(z.string())
      })
      .passthrough()
  })
  .passthrough();

const RESULT_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function parseClaimedIdentity(input: {
  ownerEmail?: unknown;
  ownerId?: unknown;
  userId?: unknown;
  resultId?: unknown;
  sessionId?: unknown;
}): GenerationMatchClaimedIdentity {
  return {
    ownerEmail: trimOptional(input.ownerEmail)?.toLowerCase(),
    ownerId: trimOptional(input.ownerId),
    userId: trimOptional(input.userId),
    resultId: trimOptional(input.resultId),
    sessionId: trimOptional(input.sessionId)
  };
}

/**
 * Song Architect generations are not persisted by ID. A result/session ID
 * cannot be resolved server-side, so ID-only requests are rejected.
 */
export function rejectUnsupportedResultReference(
  claimed: GenerationMatchClaimedIdentity,
  hasSongDNA: boolean
): GenerationMatchRequestError | null {
  const resultId = claimed.resultId;
  const sessionId = claimed.sessionId;
  if (!resultId && !sessionId) return null;
  if (hasSongDNA) return null;

  const candidate = resultId ?? sessionId ?? "";
  if (candidate.length > GENERATION_MATCH_RESULT_ID_MAX_LENGTH || !RESULT_ID_PATTERN.test(candidate)) {
    return {
      ok: false,
      code: "invalid_song_architect_reference",
      message: "That Song Architect result reference is not valid."
    };
  }
  return {
    ok: false,
    code: "song_architect_result_not_found",
    message: "Song Architect results are not stored by ID. Return to the blueprint in this session and try again."
  };
}

export function authorizeGenerationMatchOwnership(input: {
  trustedEmail: string;
  claimed: GenerationMatchClaimedIdentity;
}): { ok: true } | GenerationMatchRequestError {
  if (input.claimed.ownerId || input.claimed.userId) {
    return {
      ok: false,
      code: "ownership_rejected",
      message: "Client-provided ownership identifiers are not accepted."
    };
  }
  if (input.claimed.ownerEmail && input.claimed.ownerEmail !== input.trustedEmail) {
    return {
      ok: false,
      code: "ownership_mismatch",
      message: "This Song Architect result cannot be evaluated for another account."
    };
  }
  return { ok: true };
}

export function parseSongDNAReference(raw: unknown): { ok: true; songDNA: SongDNA } | GenerationMatchRequestError {
  if (raw === undefined || raw === null || raw === "") {
    return {
      ok: false,
      code: "missing_song_architect_reference",
      message: "A Song Architect blueprint is required before Generation Match can run."
    };
  }

  let payload: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > GENERATION_MATCH_SONG_DNA_MAX_BYTES) {
      return {
        ok: false,
        code: "invalid_song_architect_reference",
        message: "The Song Architect blueprint is too large to evaluate."
      };
    }
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      return {
        ok: false,
        code: "invalid_song_architect_reference",
        message: "The Song Architect blueprint could not be read."
      };
    }
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      ok: false,
      code: "invalid_song_architect_reference",
      message: "The Song Architect blueprint is missing required Song DNA."
    };
  }

  const parsed = SongDNASchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_song_architect_reference",
      message: "The Song Architect blueprint did not pass validation."
    };
  }
  return { ok: true, songDNA: parsed.data as SongDNA };
}
