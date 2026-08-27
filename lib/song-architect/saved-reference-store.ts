import { randomUUID } from "node:crypto";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  sanitizePersistedBlueprint,
  type SavedReferenceRecord
} from "@/lib/song-architect/saved-reference";
import { REFERENCE_STYLE_ANALYSIS_METADATA } from "@/lib/song-architect/reference-style-blueprint";

export type SavedReferenceStore = {
  upsert(fields: Omit<SavedReferenceRecord, "id" | "createdAt" | "updatedAt">): Promise<{
    record: SavedReferenceRecord;
    reused: boolean;
  }>;
  listByOwner(ownerEmail: string): Promise<SavedReferenceRecord[]>;
  deleteOwned(id: string, ownerEmail: string): Promise<"deleted" | "not_found">;
};

type MemoryRow = SavedReferenceRecord;

function nowIso(): string {
  return new Date().toISOString();
}

function dedupeKey(ownerEmail: string, spotifyTrackId: string, blueprintVersion: number): string {
  return `${ownerEmail}::${spotifyTrackId}::${blueprintVersion}`;
}

export function createMemorySavedReferenceStore(seed: SavedReferenceRecord[] = []): SavedReferenceStore {
  const byId = new Map<string, MemoryRow>();
  const byDedupe = new Map<string, string>();
  for (const row of seed) {
    byId.set(row.id, { ...row, sourceArtists: [...row.sourceArtists] });
    byDedupe.set(dedupeKey(row.ownerEmail, row.spotifyTrackId, row.blueprintVersion), row.id);
  }

  return {
    async upsert(fields) {
      const key = dedupeKey(fields.ownerEmail, fields.spotifyTrackId, fields.blueprintVersion);
      const existingId = byDedupe.get(key);
      const timestamp = nowIso();
      if (existingId) {
        const existing = byId.get(existingId);
        if (existing) {
          const updated: MemoryRow = {
            ...existing,
            ...fields,
            sourceArtists: [...fields.sourceArtists],
            updatedAt: timestamp
          };
          byId.set(existingId, updated);
          return { record: updated, reused: true };
        }
      }
      const record: MemoryRow = {
        id: randomUUID(),
        ...fields,
        sourceArtists: [...fields.sourceArtists],
        createdAt: timestamp,
        updatedAt: timestamp
      };
      byId.set(record.id, record);
      byDedupe.set(key, record.id);
      return { record, reused: false };
    },
    async listByOwner(ownerEmail) {
      return [...byId.values()]
        .filter((row) => row.ownerEmail === ownerEmail)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    },
    async deleteOwned(id, ownerEmail) {
      const existing = byId.get(id);
      if (!existing || existing.ownerEmail !== ownerEmail) {
        return "not_found";
      }
      byId.delete(id);
      byDedupe.delete(dedupeKey(existing.ownerEmail, existing.spotifyTrackId, existing.blueprintVersion));
      return "deleted";
    }
  };
}

type SupabaseRow = {
  id: string;
  owner_email: string;
  spotify_track_id: string;
  source_title: string;
  source_artists: string[] | null;
  source_album: string | null;
  artwork_url: string | null;
  spotify_url: string | null;
  blueprint: unknown;
  analysis_type: string;
  blueprint_version: number;
  created_at: string;
  updated_at: string;
};

function mapSupabaseRow(row: SupabaseRow): SavedReferenceRecord | null {
  const blueprint = sanitizePersistedBlueprint(row.blueprint);
  if (!blueprint) return null;
  const artists = Array.isArray(row.source_artists)
    ? row.source_artists.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : blueprint.source.artists;
  return {
    id: row.id,
    ownerEmail: row.owner_email,
    spotifyTrackId: row.spotify_track_id,
    sourceTitle: row.source_title,
    sourceArtists: artists.length > 0 ? artists : blueprint.source.artists,
    sourceAlbum: row.source_album,
    artworkUrl: row.artwork_url,
    spotifyUrl: row.spotify_url,
    blueprint,
    analysisType: REFERENCE_STYLE_ANALYSIS_METADATA,
    blueprintVersion: row.blueprint_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toInsertPayload(fields: Omit<SavedReferenceRecord, "id" | "createdAt" | "updatedAt">) {
  return {
    owner_email: fields.ownerEmail,
    spotify_track_id: fields.spotifyTrackId,
    source_title: fields.sourceTitle,
    source_artists: fields.sourceArtists,
    source_album: fields.sourceAlbum,
    artwork_url: fields.artworkUrl,
    spotify_url: fields.spotifyUrl,
    blueprint: fields.blueprint,
    analysis_type: fields.analysisType,
    blueprint_version: fields.blueprintVersion,
    updated_at: nowIso()
  };
}

export function createSupabaseSavedReferenceStore(): SavedReferenceStore {
  const table = () => getSupabaseAdmin().schema("public").from("song_architect_reference_tracks");

  return {
    async upsert(fields) {
      const existingQuery = await table()
        .select("*")
        .eq("owner_email", fields.ownerEmail)
        .eq("spotify_track_id", fields.spotifyTrackId)
        .eq("blueprint_version", fields.blueprintVersion)
        .maybeSingle();
      if (existingQuery.error) {
        throw new Error(`Saved reference lookup failed: ${existingQuery.error.message}`);
      }
      const payload = toInsertPayload(fields);
      if (existingQuery.data) {
        const updateQuery = await table()
          .update(payload)
          .eq("id", (existingQuery.data as SupabaseRow).id)
          .eq("owner_email", fields.ownerEmail)
          .select("*")
          .single();
        if (updateQuery.error || !updateQuery.data) {
          throw new Error(`Saved reference update failed: ${updateQuery.error?.message ?? "empty update"}`);
        }
        const mapped = mapSupabaseRow(updateQuery.data as SupabaseRow);
        if (!mapped) {
          throw new Error("Saved reference update returned an invalid blueprint.");
        }
        return { record: mapped, reused: true };
      }

      const insertQuery = await table().insert(payload).select("*").single();
      if (insertQuery.error || !insertQuery.data) {
        if (insertQuery.error?.code === "23505") {
          const raced = await table()
            .select("*")
            .eq("owner_email", fields.ownerEmail)
            .eq("spotify_track_id", fields.spotifyTrackId)
            .eq("blueprint_version", fields.blueprintVersion)
            .maybeSingle();
          if (!raced.error && raced.data) {
            const updateQuery = await table()
              .update(payload)
              .eq("id", (raced.data as SupabaseRow).id)
              .eq("owner_email", fields.ownerEmail)
              .select("*")
              .single();
            if (updateQuery.error || !updateQuery.data) {
              throw new Error(`Saved reference race update failed: ${updateQuery.error?.message ?? "empty update"}`);
            }
            const mapped = mapSupabaseRow(updateQuery.data as SupabaseRow);
            if (!mapped) {
              throw new Error("Saved reference race update returned an invalid blueprint.");
            }
            return { record: mapped, reused: true };
          }
        }
        throw new Error(`Saved reference insert failed: ${insertQuery.error?.message ?? "empty insert"}`);
      }
      const mapped = mapSupabaseRow(insertQuery.data as SupabaseRow);
      if (!mapped) {
        throw new Error("Saved reference insert returned an invalid blueprint.");
      }
      return { record: mapped, reused: false };
    },
    async listByOwner(ownerEmail) {
      const query = await table()
        .select("*")
        .eq("owner_email", ownerEmail)
        .order("updated_at", { ascending: false });
      if (query.error) {
        throw new Error(`Saved reference list failed: ${query.error.message}`);
      }
      return ((query.data ?? []) as SupabaseRow[])
        .map((row) => mapSupabaseRow(row))
        .filter((row): row is SavedReferenceRecord => Boolean(row));
    },
    async deleteOwned(id, ownerEmail) {
      const existing = await table().select("id").eq("id", id).eq("owner_email", ownerEmail).maybeSingle();
      if (existing.error) {
        throw new Error(`Saved reference delete lookup failed: ${existing.error.message}`);
      }
      if (!existing.data) {
        return "not_found";
      }
      const deleted = await table().delete().eq("id", id).eq("owner_email", ownerEmail);
      if (deleted.error) {
        throw new Error(`Saved reference delete failed: ${deleted.error.message}`);
      }
      return "deleted";
    }
  };
}

const localFallbackStore = createMemorySavedReferenceStore();
let storeOverride: SavedReferenceStore | null = null;

export function getSavedReferenceStore(): SavedReferenceStore {
  if (storeOverride) return storeOverride;
  if (isSupabaseConfigured()) return createSupabaseSavedReferenceStore();
  return localFallbackStore;
}

export function setSavedReferenceStoreForTests(store: SavedReferenceStore | null): void {
  storeOverride = store;
}
