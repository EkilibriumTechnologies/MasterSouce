// Browser-side Song Project persistence helpers. Client-safe: no server/Supabase imports.
// Persistence is best-effort and observable: failures resolve to `{ ok: false }` instead of
// throwing, so a Project save can never undo or block work the user already received.
import type { JourneyStageId } from "@/lib/journeys/stages";
import type { ProjectArtifactKind, ProjectGeneration, SongProject } from "@/lib/projects/types";

export type ProjectSaveStatus = "idle" | "saving" | "saved" | "error";

export type ProjectArtifactSaveRequest = {
  kind: ProjectArtifactKind;
  payload: Record<string, unknown>;
  generationId?: string;
  advanceTo?: JourneyStageId;
};

export type ProjectSaveResult<T> =
  | ({ ok: true } & T)
  | { ok: false; status: number | null; error: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function postProjectJson<T>(
  url: string,
  body: unknown,
  fetchImpl: FetchLike
): Promise<ProjectSaveResult<{ data: T }>> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      return { ok: false, status: response.status, error: data.error ?? "project_save_failed" };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "project_save_failed"
    };
  }
}

export async function saveProjectArtifactRequest(
  projectId: string,
  request: ProjectArtifactSaveRequest,
  fetchImpl: FetchLike = fetch
): Promise<ProjectSaveResult<{ project: SongProject | null }>> {
  const result = await postProjectJson<{ project?: SongProject }>(
    `/api/projects/${encodeURIComponent(projectId)}/artifacts`,
    {
      kind: request.kind,
      payload: request.payload,
      ...(request.generationId ? { generationId: request.generationId } : {}),
      ...(request.advanceTo ? { advanceTo: request.advanceTo } : {})
    },
    fetchImpl
  );
  return result.ok ? { ok: true, project: result.data.project ?? null } : result;
}

export async function createProjectGenerationRequest(
  projectId: string,
  body: {
    label?: string | null;
    externalId?: string | null;
    externalUrl?: string | null;
    metadata?: Record<string, unknown>;
  },
  fetchImpl: FetchLike = fetch
): Promise<ProjectSaveResult<{ generation: ProjectGeneration }>> {
  const result = await postProjectJson<{ generation?: ProjectGeneration }>(
    `/api/projects/${encodeURIComponent(projectId)}/generations`,
    body,
    fetchImpl
  );
  if (!result.ok) return result;
  if (!result.data.generation) return { ok: false, status: 200, error: "generation_missing" };
  return { ok: true, generation: result.data.generation };
}

/** Reads `?projectId=` from the current URL; empty string when absent or not a UUID. */
export function readProjectIdFromLocation(search: string): string {
  const id = new URLSearchParams(search).get("projectId")?.trim() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : "";
}
