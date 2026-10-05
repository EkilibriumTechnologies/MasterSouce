import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { JourneyStageId } from "@/lib/journeys/stages";

export type ProjectStatus = "active" | "archived" | "complete";
export type ProjectArtifactKind =
  | "idea"
  | "song_dna"
  | "lyrics"
  | "arrangement"
  | "suno_prompt"
  | "generation_match"
  | "hit_analysis"
  | "master_readiness"
  | "master_settings"
  | "export";

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

const PROJECT_SELECT =
  "id, user_id, title, status, current_stage, selected_generation_id, created_at, updated_at";
const ARTIFACT_SELECT =
  "id, project_id, user_id, kind, version, payload, created_at";
const GENERATION_SELECT =
  "id, project_id, user_id, source, external_id, external_url, label, selected, metadata, created_at, updated_at";

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

export async function listProjectsForUser(userId: string): Promise<SongProject[]> {
  const supabase = getSupabaseAdmin();
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
  const supabase = getSupabaseAdmin();
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
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`project read failed: ${error.message}`);
  return data ? mapProject(data as Record<string, unknown>) : null;
}

export async function updateProjectForUser(input: {
  userId: string;
  projectId: string;
  title?: string;
  status?: ProjectStatus;
  currentStage?: JourneyStageId;
  selectedGenerationId?: string | null;
}): Promise<SongProject | null> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) {
    patch.title = input.title.trim().slice(0, 140) || "Untitled Song";
  }
  if (input.status !== undefined) patch.status = input.status;
  if (input.currentStage !== undefined) patch.current_stage = input.currentStage;
  if (input.selectedGenerationId !== undefined) {
    if (input.selectedGenerationId === null) {
      patch.selected_generation_id = null;
    } else {
      const { data: ownedGeneration, error: generationError } = await supabase
        .from("project_generations")
        .select("id")
        .eq("id", input.selectedGenerationId)
        .eq("project_id", input.projectId)
        .eq("user_id", input.userId)
        .maybeSingle();
      if (generationError) {
        throw new Error(`project generation ownership check failed: ${generationError.message}`);
      }
      if (!ownedGeneration?.id) {
        throw new Error("generation_not_found");
      }
      patch.selected_generation_id = input.selectedGenerationId;
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", input.projectId)
    .eq("user_id", input.userId)
    .select(PROJECT_SELECT)
    .maybeSingle();
  if (error) throw new Error(`project update failed: ${error.message}`);
  return data ? mapProject(data as Record<string, unknown>) : null;
}

export async function listProjectArtifacts(
  userId: string,
  projectId: string
): Promise<ProjectArtifact[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("project_artifacts")
    .select(ARTIFACT_SELECT)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`project artifacts list failed: ${error.message}`);
  return (data ?? []).map((row) => mapArtifact(row as Record<string, unknown>));
}

export async function appendProjectArtifact(input: {
  userId: string;
  projectId: string;
  kind: ProjectArtifactKind;
  payload: Record<string, unknown>;
}): Promise<ProjectArtifact> {
  const project = await getProjectForUser(input.userId, input.projectId);
  if (!project) throw new Error("project_not_found");

  const supabase = getSupabaseAdmin();
  const { data: latest, error: latestError } = await supabase
    .from("project_artifacts")
    .select("version")
    .eq("project_id", input.projectId)
    .eq("kind", input.kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(`project artifact version lookup failed: ${latestError.message}`);

  const nextVersion = Number(latest?.version ?? 0) + 1;
  const { data, error } = await supabase
    .from("project_artifacts")
    .insert({
      project_id: input.projectId,
      user_id: input.userId,
      kind: input.kind,
      version: nextVersion,
      payload: input.payload
    })
    .select(ARTIFACT_SELECT)
    .single();
  if (error) throw new Error(`project artifact insert failed: ${error.message}`);

  await supabase
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.projectId)
    .eq("user_id", input.userId);

  return mapArtifact(data as Record<string, unknown>);
}

export async function listProjectGenerations(
  userId: string,
  projectId: string
): Promise<ProjectGeneration[]> {
  const supabase = getSupabaseAdmin();
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
  if (!project) throw new Error("project_not_found");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("project_generations")
    .insert({
      project_id: input.projectId,
      user_id: input.userId,
      source: "suno",
      external_id: input.externalId ?? null,
      external_url: input.externalUrl ?? null,
      label: input.label?.trim().slice(0, 120) || null,
      metadata: input.metadata ?? {}
    })
    .select(GENERATION_SELECT)
    .single();
  if (error) throw new Error(`project generation insert failed: ${error.message}`);

  await updateProjectForUser({
    userId: input.userId,
    projectId: input.projectId,
    currentStage: "generation"
  });

  return mapGeneration(data as Record<string, unknown>);
}
