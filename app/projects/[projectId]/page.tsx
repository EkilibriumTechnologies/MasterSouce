"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { MasterSauceBrandNav } from "@/components/brand/mastersauce-brand-header";
import { JourneyProgress } from "@/components/projects/journey-progress";
import { NativeSongGenerator } from "@/components/projects/native-song-generator";
import { GenerationMatchPanel } from "@/components/song-architect/generation-match-panel";
import { JOURNEY_STAGES, getJourneyStage, getJourneyStageIndex } from "@/lib/journeys/stages";
import type { ProjectArtifact, ProjectGeneration, SongProject } from "@/lib/projects/types";
import type { SongDNA } from "@/lib/song-architect/types";

type ProjectPayload = {
  project: SongProject;
  artifacts: ProjectArtifact[];
  generations: ProjectGeneration[];
};

const pillPrimaryStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: "12px 18px",
  background: "#34d399",
  color: "#04120d",
  fontWeight: 900,
  textDecoration: "none",
  cursor: "pointer"
};

const pillSecondaryStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: "12px 18px",
  border: "1px solid rgba(255,255,255,.16)",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none"
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 22,
  padding: 22,
  background: "rgba(255,255,255,.03)"
};

function stringField(payload: Record<string, unknown> | undefined, key: string): string {
  const value = payload?.[key];
  return typeof value === "string" ? value : "";
}

export default function SongProjectPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params?.projectId ?? "";
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [copiedField, setCopiedField] = useState("");

  const loadProject = useCallback(async (): Promise<ProjectPayload | null> => {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
    if (res.status === 401) {
      router.replace("/projects");
      return null;
    }
    const payload = (await res.json()) as ProjectPayload & { error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Unable to load song project.");
    return payload;
  }, [projectId, router]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [payload, sessionRes] = await Promise.all([
          loadProject(),
          fetch("/api/auth/session", { cache: "no-store" })
        ]);
        const session = (await sessionRes.json().catch(() => ({}))) as {
          user?: { email?: string } | null;
        };
        if (cancelled) return;
        if (session.user?.email) setAccountEmail(session.user.email);
        if (payload) {
          setData(payload);
          setTitleDraft(payload.project.title);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load song project.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadProject]);

  const refreshProject = useCallback(async () => {
    try {
      const payload = await loadProject();
      if (payload) setData(payload);
    } catch {
      // Keep the current view; the next navigation reloads the Project.
    }
  }, [loadProject]);

  const latestByKind = useMemo(() => {
    const map = new Map<string, ProjectArtifact>();
    for (const artifact of data?.artifacts ?? []) {
      const current = map.get(artifact.kind);
      if (!current || artifact.version > current.version) map.set(artifact.kind, artifact);
    }
    return map;
  }, [data?.artifacts]);

  async function patchProject(patch: Record<string, unknown>): Promise<SongProject | null> {
    setActionError("");
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    const payload = (await res.json().catch(() => ({}))) as { project?: SongProject; error?: string };
    if (!res.ok || !payload.project) {
      setActionError(payload.error ?? "Unable to update project.");
      return null;
    }
    setData((current) => (current ? { ...current, project: payload.project! } : current));
    setTitleDraft(payload.project.title);
    return payload.project;
  }

  async function lockGenerationAndMaster(generationId: string): Promise<void> {
    // Only enter mastering once the lock is durably saved on the Project.
    const updated = await patchProject({
      selectedGenerationId: generationId,
      currentStage: "selected_generation"
    });
    if (updated) {
      await refreshProject();
      router.push(`/?projectId=${updated.id}#master`);
    }
  }

  async function copyToClipboard(field: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(""), 1800);
    } catch {
      setActionError("Clipboard is unavailable. Select and copy the text manually.");
    }
  }

  if (error) {
    return (
      <main style={{ minHeight: "100vh", background: "#050505", color: "#fff" }}>
        <MasterSauceBrandNav backHref="/projects" backLabel="← Song Journeys" />
        <div style={{ width: "min(900px, calc(100% - 32px))", margin: "48px auto" }}>
          {error === "project_not_found" ? "This song project doesn't exist or isn't yours." : error}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ minHeight: "100vh", background: "#050505", color: "#fff" }}>
        <MasterSauceBrandNav backHref="/projects" backLabel="← Song Journeys" />
        <div style={{ width: "min(900px, calc(100% - 32px))", margin: "48px auto", color: "rgba(255,255,255,.55)" }}>
          Loading song project…
        </div>
      </main>
    );
  }

  const { project, generations } = data;
  const stage = getJourneyStage(project.currentStage);
  const stageIndex = getJourneyStageIndex(project.currentStage);
  const journeyStepCount = JOURNEY_STAGES.filter((item) => item.id !== "complete").length;
  const journeyStep = Math.min(stageIndex + 1, journeyStepCount);
  const earlyStage = stageIndex < getJourneyStageIndex("generation");
  const canLockVersion = stageIndex >= getJourneyStageIndex("generation") && generations.length > 0;
  const masteringStage = ["selected_generation", "master", "export"].includes(project.currentStage);
  const isComplete = project.currentStage === "complete";

  const songDNA = latestByKind.get("song_dna")?.payload.songDNA as SongDNA | undefined;
  const sunoPrompt = latestByKind.get("suno_prompt")?.payload;
  const lyricsPayload = latestByKind.get("lyrics")?.payload;
  const stylePrompt = stringField(sunoPrompt, "stylePrompt");
  const sunoBlueprint = stringField(sunoPrompt, "sunoBlueprint");
  const lyricsForSuno =
    stringField(lyricsPayload, "generationOptimizedLyrics") || stringField(lyricsPayload, "lyrics");
  const latestExport = latestByKind.get("export")?.payload;
  const selectedGeneration = generations.find((item) => item.id === project.selectedGenerationId) ?? null;

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff" }}>
      <MasterSauceBrandNav backHref="/projects" backLabel="← Song Journeys" />

      <section style={{ width: "min(1180px, calc(100% - 32px))", margin: "0 auto", padding: "34px 0 90px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>
            <div style={{ color: "#6ee7b7", fontSize: 11, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase" }}>
              {project.currentStage === "complete"
                ? "Song Journey · Complete"
                : `Song Journey · Step ${journeyStep} of ${journeyStepCount} · ${stage.label}`}
            </div>
            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                if (titleDraft.trim() && titleDraft.trim() !== project.title) {
                  void patchProject({ title: titleDraft });
                }
              }}
              aria-label="Song title"
              style={{
                marginTop: 8,
                width: "100%",
                border: 0,
                borderBottom: "1px solid rgba(255,255,255,.10)",
                outline: "none",
                background: "transparent",
                color: "#fff",
                fontSize: "clamp(34px, 6vw, 64px)",
                fontWeight: 800,
                lineHeight: 1.05,
                padding: "0 0 8px"
              }}
            />
            <p style={{ color: "rgba(255,255,255,.55)", maxWidth: 680, lineHeight: 1.65 }}>
              {isComplete
                ? `Finished. Final master exported${typeof latestExport?.format === "string" ? ` as ${String(latestExport.format).toUpperCase()}` : ""}.`
                : stage.description}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {earlyStage ? (
              <Link href={`/song-architect?projectId=${project.id}`} style={pillPrimaryStyle}>
                Continue in Song Architect →
              </Link>
            ) : null}
            {project.currentStage === "generation" && songDNA && stylePrompt ? (
              <a href="#generation-match" style={pillPrimaryStyle}>
                Back from Suno? Check your version ↓
              </a>
            ) : null}
            {project.currentStage === "analyze_refine" ? (
              <>
                <Link href={`/ar-ai?projectId=${project.id}`} style={pillSecondaryStyle}>
                  Analyze release readiness
                </Link>
                {generations.length === 1 ? (
                  <button
                    type="button"
                    onClick={() => void lockGenerationAndMaster(generations[0].id)}
                    style={pillPrimaryStyle}
                  >
                    Lock this version → Master
                  </button>
                ) : null}
              </>
            ) : null}
            {masteringStage ? (
              <Link
                href={`/?projectId=${project.id}#master`}
                style={{ ...pillPrimaryStyle, background: "#fff", color: "#050505" }}
              >
                Continue to Mastering →
              </Link>
            ) : null}
            {isComplete ? (
              <Link href={`/?projectId=${project.id}#master`} style={pillSecondaryStyle}>
                Master again
              </Link>
            ) : null}
          </div>
        </div>

        {actionError ? (
          <p role="alert" style={{ color: "#fca5a5", marginTop: 14 }}>
            {actionError === "generation_not_found"
              ? "That version isn't part of this song project."
              : actionError}
          </p>
        ) : null}

        <section style={{ marginTop: 28 }} aria-label="Journey progress">
          <div
            style={{
              marginBottom: 10,
              color: "rgba(255,255,255,.5)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".14em",
              textTransform: "uppercase"
            }}
          >
            Your Song Journey
          </div>
          <JourneyProgress currentStage={project.currentStage} />
        </section>

        {stylePrompt && lyricsForSuno && !earlyStage && !isComplete ? (
          <NativeSongGenerator
            projectId={project.id}
            onGenerated={() => void refreshProject()}
          />
        ) : null}

        {stylePrompt && !earlyStage && !isComplete ? (
          <section style={{ ...cardStyle, marginTop: 18 }} aria-label="Suno prompt">
            <h2 style={{ margin: 0, fontSize: 20 }}>Generate in Suno</h2>
            <p style={{ color: "rgba(255,255,255,.52)", lineHeight: 1.6, marginBottom: 12 }}>
              Your saved prompt and lyrics. Generate outside MasterSauce, then come back to this project to check the result.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={pillSecondaryStyle} onClick={() => void copyToClipboard("style", stylePrompt)}>
                {copiedField === "style" ? "Style prompt copied" : "Copy style prompt"}
              </button>
              {lyricsForSuno ? (
                <button type="button" style={pillSecondaryStyle} onClick={() => void copyToClipboard("lyrics", lyricsForSuno)}>
                  {copiedField === "lyrics" ? "Lyrics copied" : "Copy lyrics"}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 18 }}>
          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Project memory</h2>
            <p style={{ color: "rgba(255,255,255,.52)", lineHeight: 1.6 }}>
              MasterSauce keeps each major output as a versioned artifact, so refining a prompt never destroys the previous one.
            </p>

            {latestByKind.size === 0 ? (
              <div style={{ marginTop: 18, border: "1px dashed rgba(255,255,255,.14)", borderRadius: 18, padding: 20, color: "rgba(255,255,255,.48)" }}>
                No saved artifacts yet. Continue into Song Architect to create the first Song DNA.
              </div>
            ) : (
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {[...latestByKind.values()].map((artifact) => (
                  <div key={artifact.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid rgba(255,255,255,.07)", padding: "10px 0" }}>
                    <span style={{ textTransform: "capitalize" }}>{artifact.kind.replaceAll("_", " ")}</span>
                    <span style={{ color: "rgba(255,255,255,.38)", fontSize: 12 }}>v{artifact.version}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Generations</h2>
            <div style={{ marginTop: 12, fontSize: 42, fontWeight: 900 }}>{generations.length}</div>
            <div style={{ color: "rgba(255,255,255,.48)", fontSize: 13 }}>
              Suno + MasterSauce candidates attached to this song
              {selectedGeneration ? ` · locked: ${selectedGeneration.label ?? "selected version"}` : ""}
            </div>

            {generations.length > 0 ? (
              <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                {generations.map((generation, index) => {
                  const selected = project.selectedGenerationId === generation.id;
                  return (
                    <div
                      key={generation.id}
                      style={{
                        border: selected
                          ? "1px solid rgba(52,211,153,.48)"
                          : "1px solid rgba(255,255,255,.08)",
                        borderRadius: 14,
                        padding: 12,
                        background: selected ? "rgba(52,211,153,.08)" : "rgba(255,255,255,.02)",
                        overflowWrap: "anywhere"
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800 }}>
                        {generation.label || `Generation ${index + 1}`}
                      </div>
                      <div style={{ marginTop: 4, color: "rgba(255,255,255,.38)", fontSize: 11 }}>
                        {selected
                          ? "Locked for mastering"
                          : generation.source === "lyria"
                            ? "Generated inside MasterSauce"
                            : "Analyzed candidate"}
                        {generation.externalUrl ? (
                          <>
                            {" · "}
                            <a
                              href={generation.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              style={{ color: "#6ee7b7" }}
                            >
                              Open source link
                            </a>
                          </>
                        ) : null}
                      </div>
                      {generation.source === "lyria" ? (
                        <audio
                          controls
                          preload="metadata"
                          src={`/api/projects/${encodeURIComponent(project.id)}/generations/${encodeURIComponent(generation.id)}/audio`}
                          style={{ width: "100%", marginTop: 10 }}
                        >
                          Your browser does not support audio playback.
                        </audio>
                      ) : null}
                      {!selected && canLockVersion ? (
                        <button
                          type="button"
                          onClick={() => void lockGenerationAndMaster(generation.id)}
                          style={{ ...pillPrimaryStyle, marginTop: 10, padding: "8px 11px", fontSize: 12 }}
                        >
                          Lock this version → Master
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div style={{ marginTop: 22, color: "rgba(255,255,255,.40)", fontSize: 12, lineHeight: 1.6 }}>
              MasterSauce-native generations are stored privately with the Journey. External Suno/Udio candidates keep their source metadata and analysis history.
            </div>
          </aside>
        </div>

        {songDNA && stylePrompt && !earlyStage && !isComplete ? (
          <section id="generation-match" style={{ ...cardStyle, marginTop: 18 }} aria-label="Generation Match">
            <h2 style={{ margin: 0, fontSize: 20 }}>Check a generated version</h2>
            <p style={{ color: "rgba(255,255,255,.52)", lineHeight: 1.6 }}>
              Upload a Suno or Udio render. MasterSauce compares it with this project&apos;s Song DNA and saves the
              version so you can lock it for mastering.
            </p>
            <GenerationMatchPanel
              songDNA={songDNA}
              stylePrompt={stylePrompt}
              sunoBlueprint={sunoBlueprint || undefined}
              getBillingEmail={() => accountEmail}
              projectId={project.id}
              onProjectSaved={() => void refreshProject()}
            />
          </section>
        ) : null}
      </section>
    </main>
  );
}
