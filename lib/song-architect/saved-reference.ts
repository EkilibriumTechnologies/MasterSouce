import { z } from "zod";
import {
  normalizeReferenceStyleBlueprint,
  REFERENCE_STYLE_ANALYSIS_METADATA,
  REFERENCE_STYLE_BLUEPRINT_VERSION,
  ReferenceStyleBlueprintSchema,
  type ReferenceStyleBlueprint
} from "@/lib/song-architect/reference-style-blueprint";

export const SAVED_REFERENCE_NOT_FOUND_MESSAGE = "That saved reference could not be found.";
export const SAVED_REFERENCE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SavedReferenceClaimedIdentity = {
  ownerEmail?: string;
  ownerId?: string;
  userId?: string;
};

export type PublicSavedReference = {
  id: string;
  spotifyTrackId: string;
  title: string;
  artists: string[];
  album: string | null;
  artworkUrl: string | null;
  spotifyUrl: string | null;
  creativeSummary: string;
  analysisType: typeof REFERENCE_STYLE_ANALYSIS_METADATA;
  directlyAnalyzedAudio: false;
  blueprintVersion: number;
  createdAt: string;
  updatedAt: string;
  blueprint: ReferenceStyleBlueprint;
};

export type SavedReferenceRecord = {
  id: string;
  ownerEmail: string;
  spotifyTrackId: string;
  sourceTitle: string;
  sourceArtists: string[];
  sourceAlbum: string | null;
  artworkUrl: string | null;
  spotifyUrl: string | null;
  blueprint: ReferenceStyleBlueprint;
  analysisType: typeof REFERENCE_STYLE_ANALYSIS_METADATA;
  blueprintVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type SavedReferenceRequestError = {
  ok: false;
  status: number;
  code:
    | "invalid_payload"
    | "malformed_blueprint"
    | "ownership_rejected"
    | "ownership_mismatch"
    | "reference_not_found";
  message: string;
};

const SaveRequestSchema = z
  .object({
    blueprint: z.unknown(),
    track: z.unknown().optional(),
    ownerEmail: z.unknown().optional(),
    ownerId: z.unknown().optional(),
    userId: z.unknown().optional()
  })
  .passthrough();

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function isSavedReferenceId(value: string): boolean {
  return SAVED_REFERENCE_UUID_PATTERN.test(value.trim());
}

export function parseClaimedSavedReferenceIdentity(input: {
  ownerEmail?: unknown;
  ownerId?: unknown;
  userId?: unknown;
}): SavedReferenceClaimedIdentity {
  return {
    ownerEmail: trimOptional(input.ownerEmail)?.toLowerCase(),
    ownerId: trimOptional(input.ownerId),
    userId: trimOptional(input.userId)
  };
}

/**
 * Client ownership fields never become the stored owner. Matching ownerEmail is ignored;
 * mismatched ownerEmail / any ownerId / userId is rejected.
 */
export function authorizeSavedReferenceOwnership(input: {
  trustedEmail: string;
  claimed: SavedReferenceClaimedIdentity;
}): { ok: true } | SavedReferenceRequestError {
  if (input.claimed.ownerId || input.claimed.userId) {
    return {
      ok: false,
      status: 403,
      code: "ownership_rejected",
      message: "Client-provided ownership identifiers are not accepted."
    };
  }
  if (input.claimed.ownerEmail && input.claimed.ownerEmail !== input.trustedEmail) {
    return {
      ok: false,
      status: 403,
      code: "ownership_mismatch",
      message: "This reference cannot be saved for another account."
    };
  }
  return { ok: true };
}

export function sanitizePersistedBlueprint(raw: unknown): ReferenceStyleBlueprint | null {
  const parsed = ReferenceStyleBlueprintSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return normalizeReferenceStyleBlueprint(raw);
}

export function parseSaveReferencePayload(body: unknown):
  | { ok: true; blueprint: ReferenceStyleBlueprint; claimed: SavedReferenceClaimedIdentity }
  | SavedReferenceRequestError {
  const parsed = SaveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: "invalid_payload",
      message: "A Reference Style Blueprint is required."
    };
  }

  const blueprint = sanitizePersistedBlueprint(parsed.data.blueprint);
  if (!blueprint) {
    return {
      ok: false,
      status: 400,
      code: "malformed_blueprint",
      message: "That Reference Style Blueprint is not valid."
    };
  }

  return {
    ok: true,
    blueprint,
    claimed: parseClaimedSavedReferenceIdentity(parsed.data)
  };
}

export function toPublicSavedReference(record: SavedReferenceRecord): PublicSavedReference {
  return {
    id: record.id,
    spotifyTrackId: record.spotifyTrackId,
    title: record.sourceTitle,
    artists: [...record.sourceArtists],
    album: record.sourceAlbum,
    artworkUrl: record.artworkUrl,
    spotifyUrl: record.spotifyUrl,
    creativeSummary: record.blueprint.interpretation.creativeSummary,
    analysisType: REFERENCE_STYLE_ANALYSIS_METADATA,
    directlyAnalyzedAudio: false,
    blueprintVersion: record.blueprintVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    blueprint: record.blueprint
  };
}

export function toPersistedRecordFields(input: {
  trustedEmail: string;
  blueprint: ReferenceStyleBlueprint;
}): Omit<SavedReferenceRecord, "id" | "createdAt" | "updatedAt"> {
  const blueprint = sanitizePersistedBlueprint(input.blueprint);
  if (!blueprint) {
    throw new Error("persist_blueprint_invalid");
  }
  return {
    ownerEmail: input.trustedEmail,
    spotifyTrackId: blueprint.source.trackId,
    sourceTitle: blueprint.source.title,
    sourceArtists: [...blueprint.source.artists],
    sourceAlbum: blueprint.source.album ?? null,
    artworkUrl: blueprint.source.artworkUrl ?? null,
    spotifyUrl: blueprint.source.spotifyUrl ?? null,
    blueprint,
    analysisType: REFERENCE_STYLE_ANALYSIS_METADATA,
    blueprintVersion: REFERENCE_STYLE_BLUEPRINT_VERSION
  };
}

export function persistedRecordContainsSecrets(record: SavedReferenceRecord): boolean {
  const serialized = JSON.stringify(record);
  return (
    /access_token|refresh_token|SPOTIFY_CLIENT_SECRET|Bearer\s+[A-Za-z0-9._-]+/i.test(serialized) ||
    /You are MasterSauce Song Architect's Reference Style interpreter/i.test(serialized) ||
    /"requestType"\s*:\s*"reference_style_blueprint"/i.test(serialized) ||
    /openaiPrompt|systemPrompt|rawPrompt/i.test(serialized)
  );
}
