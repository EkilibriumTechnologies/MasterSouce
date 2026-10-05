import { getJourneyDb } from "@/lib/journeys/db";
import {
  JOURNEY_STAGE_IDS,
  getJourneyStageIndex,
  type JourneyStageId
} from "@/lib/journeys/stages";
import {
  MASTERING_ARTIFACT_KINDS,
  PROJECT_ARTIFACT_PAYLOAD_MAX_BYTES,
  isProjectUuid,
  isSafeExternalUrl,
  type ProjectArtifact,
  type ProjectArtifactKind,
  type ProjectGeneration,
  type ProjectStatus,
  type SongProject
} from "@/lib/projects/types";

export type {
  ProjectArtifact,
  ProjectArtifactKind,
  ProjectGeneration,
  ProjectStatus,
  SongProject
} from "@/lib/projects/types";

/** Thrown store errors that routes map to client-safe responses. */
export type ProjectStoreErrorCode =
  | "project_not_found"
  | "generation_not_found"
  | "artifact_payload_too_large"
  | "invalid_external_url"
  | "selected_generation_required";

export class ProjectStoreError extends Error {
  constructor(public readonly code: ProjectStoreErrorCode) {
    super(code);
    this.name = "ProjectStoreError";
  }
}

const PROJECT_SELECT =
  "id, user_id, title, status, current_stage, selected_generation_id, created_at, updated_at";
const ARTIFACT_SELECT =
  "id, project_id, user_id, kind, version, payload, created_at";
const GENERATION_SELECT =
  "id, project_id, user_id, source, external_id, external_url, label, selected, metadata, created_at, updated_at";
const ARTIFACT_VERSION_ATTEMPTS = 3;

function mapProject(row: Record<string, unknown>): SongProject {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title),
    status: row.status as ProjectStatus,
    currentStage: row.current_stage as JourneyStageId,
    selectedGenerationId:
      typeof row.selected_generation_id === "string" ? row.selected_generation_id : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapArtifact(row: Record<string, unknown>): ProjectArtifact {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    userId: String(row.user_id),
    kind: row.kind as ProjectArtifactKind,
    version: Number(row.version),
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at)
  };
}

function mapGeneration(row: Record<string, unknown>): ProjectGeneration {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    userId: String(row.user_id),
    source: String(row.source),
    externalId: typeof row.external_id === "string" ? row.external_id : null,
    externalUrl: typeof row.external_url === "string" ? row.external_url : null,
    label: typeof row.label === "string" ? row.label : null,
    selected: Boolean(row.selected),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function statusForStage(stage: JourneyStageId, current: ProjectStatus): ProjectStatus {
  if (stage === "complete") return current === "archived" ? current : "complete";
  return current === "complete" ? "active" : current;
}

export async function listProjectsForUser(userId: string): Promise<SongProject[]> {
  const supabase = getJourneyDb();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`projects list failed: ${error.message}`);
  return (data ?? []).map((row) => mapProject(row as Record<string, unknown>));
}

export async function createProjectForUser(
  userId: string,
  title = "Untitled Song"
): Promise<SongProject> {
  const supabase = getJourneyDb();
  const cleanTitle = title.trim().slice(0, 140) || "Untitled Song";
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      title: cleanTitle,
      status: "active",
      current_stage: "idea"
    })
    .select(PROJECT_SELECT)
    .single();
  if (error) throw new Error(`project create failed: ${error.message}`);
  return mapProject(data as Record<string, unknown>);
}

export async function getProjectForUser(
  userId: string,
  projectId: string
): Promise<SongProject | null> {
  if (!isProjectUuid(projectId)) return null;
  const supabase = getJourneyDb();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`project read failed: ${error.message}`);
  return data ? mapProject(data as Record<string, unknown>) : null;
}

/** Generation lookup that only succeeds when the generation belongs to this user's Project. */
async function getOwnedGeneration(
  userId: string,
  projectId: string,
  generationId: string
): Promise<ProjectGeneration | null> {
  if (!isProjectUuid(generationId)) return null;
  const supabase = getJourneyDb();
  const { data, error } = await supabase
    .from("project_generations")
    .select(GENERATION_SELECT)
    .eq("id", generationId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`project generation ownership check failed: ${error.message}`);
  return data ? mapGeneration(data as Record<string, unknown>) : null;
}

export async function updateProjectForUser(input: {
  userId: string;
  projectId: string;
  title?: string;
  status?: ProjectStatus;
  currentStage?: JourneyStageId;
  selectedGenerationId?: string | null;
}): Promise<SongProject | null> {
  const existing = await getProjectForUser(input.userId, input.projectId);
  if (!existing) return null;

  const supabase = getJourneyDb();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) {
    patch.title = input.title.trim().slice(0, 140) || "Untitled Song";
  }

  let nextSelectedGenerationId = existing.selectedGenerationId;
  if (input.selectedGenerationId !== undefined) {
    if (input.selectedGenerationId !== null) {
      const owned = await getOwnedGeneration(input.userId, existing.id, input.selectedGenerationId);
      if (!owned) throw new ProjectStoreError("generation_not_found");
    }
    nextSelectedGenerationId = input.selectedGenerationId;
    patch.selected_generation_id = input.selectedGenerationId;
  }

  const stageAfter = input.currentStage ?? existing.currentStage;
  if (stageAfter === "selected_generation" && nextSelectedGenerationId === null) {
    // "Lock Version" is only meaningful when a real, owned generation is locked.
    throw new ProjectStoreError("selected_generation_required");
  }
  if (input.currentStage !== undefined) patch.current_stage = input.currentStage;

  patch.status = input.status ?? statusForStage(stageAfter, existing.status);

  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", existing.id)
    .eq("user_id", input.userId)
    .select(PROJECT_SELECT)
    .maybeSingle();
  if (error) throw new Error(`project update failed: ${error.message}`);
  if (!data) return null;

  if (input.selectedGenerationId !== undefined) {
    await syncSelectedGenerationFlags(input.userId, existing.id, nextSelectedGenerationId);
  }

  return mapProject(data as Record<string, unknown>);
}

/** Keeps project_generations.selected consistent with the authoritative projects.selected_generation_id. */
async function syncSelectedGenerationFlags(
  userId: string,
  projectId: string,
  selectedGenerationId: string | null
): Promise<void> {
  const supabase = getJourneyDb();
  const now = new Date().toISOString();
  const { error: clearError } = await supabase
    .from("project_generations")
    .update({ selected: false, updated_at: now })
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("selected", true);
  if (clearError) throw new Error(`project generation selection reset failed: ${clearError.message}`);
  if (!selectedGenerationId) return;
  const { error: markError } = await supabase
    .from("project_generations")
    .update({ selected: true, updated_at: now })
    .eq("id", selectedGenerationId)
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (markError) throw new Error(`project generation selection failed: ${markError.message}`);
}

/**
 * Moves a Project forward to `requested` only if it is currently at an earlier stage.
 * The stage guard lives in the UPDATE filter so concurrent autosaves cannot rewind the Journey.
 */
export async function advanceProjectStageForUser(input: {
  userId: string;
  projectId: string;
  requested: JourneyStageId;
}): Promise<SongProject | null> {
  if (!isProjectUuid(input.projectId)) return null;
  const supabase = getJourneyDb();
  const earlierStages = JOURNEY_STAGE_IDS.slice(0, getJourneyStageIndex(input.requested));
  if (earlierStages.length > 0) {
    const patch: Record<string, unknown> = {
      current_stage: input.requested,
      updated_at: new Date().toISOString()
    };
    if (input.requested === "complete") patch.status = "complete";
    const { error } = await supabase
      .from("projects")
      .update(patch)
      .eq("id", input.projectId)
      .eq("user_id", input.userId)
      .in("current_stage", earlierStages)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`project stage advance failed: ${error.message}`);
  }
  return getProjectForUser(input.userId, input.projectId);
}

export async function listProjectArtifacts(
  userId: string,
  projectId: string
): Promise<ProjectArtifact[]> {
  if (!isProjectUuid(projectId)) return [];
  const supabase = getJourneyDb();
  const { data, error } = await supabase
    .from("project_artifacts")
    .select(ARTIFACT_SELECT)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`project artifacts list failed: ${error.message}`);
  return (data ?? []).map((row) => mapArtifact(row as Record<string, unknown>));
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function appendProjectArtifact(input: {
  userId: string;
  projectId: string;
  kind: ProjectArtifactKind;
  payload: Record<string, unknown>;
  generationId?: string;
  advanceTo?: JourneyStageId;
}): Promise<{ artifact: ProjectArtifact; project: SongProject }> {
  const project = await getProjectForUser(input.userId, input.projectId);
  if (!project) throw new ProjectStoreError("project_not_found");

  // Server-owned lineage fields always override anything the client put in the payload.
  const payload: Record<string, unknown> = { ...input.payload };
  delete payload.generationId;
  delete payload.selectedGenerationId;
  if (input.generationId !== undefined) {
    const generation = await getOwnedGeneration(input.userId, project.id, input.generationId);
    if (!generation) throw new ProjectStoreError("generation_not_found");
    payload.generationId = generation.id;
  }
  if (MASTERING_ARTIFACT_KINDS.includes(input.kind)) {
    payload.selectedGenerationId = project.selectedGenerationId;
  }
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > PROJECT_ARTIFACT_PAYLOAD_MAX_BYTES) {
    throw new ProjectStoreError("artifact_payload_too_large");
  }

  const supabase = getJourneyDb();
  let inserted: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < ARTIFACT_VERSION_ATTEMPTS && !inserted; attempt += 1) {
    const { data: latest, error: latestError } = await supabase
      .from("project_artifacts")
      .select("version")
      .eq("project_id", project.id)
      .eq("user_id", input.userId)
      .eq("kind", input.kind)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) {
      throw new Error(`project artifact version lookup failed: ${latestError.message}`);
    }

    const { data, error } = await supabase
      .from("project_artifacts")
      .insert({
        project_id: project.id,
        user_id: input.userId,
        kind: input.kind,
        version: Number(latest?.version ?? 0) + 1,
        payload
      })
      .select(ARTIFACT_SELECT)
      .single();
    if (error) {
      // A concurrent save took this version number; recompute and retry.
      if (isUniqueViolation(error) && attempt < ARTIFACT_VERSION_ATTEMPTS - 1) continue;
      throw new Error(`project artifact insert failed: ${error.message}`);
    }
    inserted = data as Record<string, unknown>;
  }
  if (!inserted) throw new Error("project artifact insert failed: no row returned");

  const { error: touchError } = await supabase
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", project.id)
    .eq("user_id", input.userId);
  if (touchError) throw new Error(`project touch failed: ${touchError.message}`);

  const updatedProject =
    (input.advanceTo
      ? await advanceProjectStageForUser({
          userId: input.userId,
          projectId: project.id,
          requested: input.advanceTo
        })
      : await getProjectForUser(input.userId, project.id)) ?? project;

  return { artifact: mapArtifact(inserted), project: updatedProject };
}

export async function listProjectGenerations(
  userId: string,
  projectId: string
): Promise<ProjectGeneration[]> {
  if (!isProjectUuid(projectId)) return [];
  const supabase = getJourneyDb();
  const { data, error } = await supabase
    .from("project_generations")
    .select(GENERATION_SELECT)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`project generations list failed: ${error.message}`);
  return (data ?? []).map((row) => mapGeneration(row as Record<string, unknown>));
}

export async function createProjectGeneration(input: {
  userId: string;
  projectId: string;
  externalId?: string | null;
  externalUrl?: string | null;
  label?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ProjectGeneration> {
  const project = await getProjectForUser(input.userId, input.projectId);
  if (!project) throw new ProjectStoreError("project_not_found");
  if (input.externalUrl && !isSafeExternalUrl(input.externalUrl)) {
    throw new ProjectStoreError("invalid_external_url");
  }
  const metadata = input.metadata ?? {};
  if (Buffer.byteLength(JSON.stringify(metadata), "utf8") > PROJECT_ARTIFACT_PAYLOAD_MAX_BYTES) {
    throw new ProjectStoreError("artifact_payload_too_large");
  }

  const supabase = getJourneyDb();
  const { data, error } = await supabase
    .from("project_generations")
    .insert({
      project_id: project.id,
      user_id: input.userId,
      source: "suno",
      external_id: input.externalId?.trim() || null,
      external_url: input.externalUrl ?? null,
      label: input.label?.trim().slice(0, 120) || null,
      metadata
    })
    .select(GENERATION_SELECT)
    .single();
  if (error) throw new Error(`project generation insert failed: ${error.message}`);

  await advanceProjectStageForUser({
    userId: input.userId,
    projectId: project.id,
    requested: "generation"
  });

  return mapGeneration(data as Record<string, unknown>);
}
