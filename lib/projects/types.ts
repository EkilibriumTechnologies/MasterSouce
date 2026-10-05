// Client-safe Song Project contracts. Keep this module free of server/Supabase imports so
// client components can share the types without pulling service-role code into bundles.
import type { JourneyStageId } from "@/lib/journeys/stages";

export const PROJECT_STATUSES = ["active", "archived", "complete"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_ARTIFACT_KINDS = [
  "idea",
  "song_dna",
  "lyrics",
  "arrangement",
  "suno_prompt",
  "generation_match",
  "hit_analysis",
  "master_readiness",
  "master_settings",
  "export"
] as const;
export type ProjectArtifactKind = (typeof PROJECT_ARTIFACT_KINDS)[number];

/** Artifacts that describe the version being mastered; the server stamps the locked generation on them. */
export const MASTERING_ARTIFACT_KINDS: readonly ProjectArtifactKind[] = [
  "master_readiness",
  "master_settings",
  "export"
];

/** Upper bound for a single artifact payload (JSON-encoded bytes). Audio never goes into Postgres. */
export const PROJECT_ARTIFACT_PAYLOAD_MAX_BYTES = 512 * 1024;

export type SongProject = {
  id: string;
  userId: string;
  title: string;
  status: ProjectStatus;
  currentStage: JourneyStageId;
  selectedGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectArtifact = {
  id: string;
  projectId: string;
  userId: string;
  kind: ProjectArtifactKind;
  version: number;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ProjectGeneration = {
  id: string;
  projectId: string;
  userId: string;
  source: string;
  externalId: string | null;
  externalUrl: string | null;
  label: string | null;
  selected: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProjectUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Only http(s) candidate links may be stored; blocks javascript:/data: URLs rendered as hrefs. */
export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
