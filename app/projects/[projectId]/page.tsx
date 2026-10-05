"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { MasterSauceBrandNav } from "@/components/brand/mastersauce-brand-header";
import { JourneyProgress } from "@/components/projects/journey-progress";
import { getJourneyStage, type JourneyStageId } from "@/lib/journeys/stages";
import type { ProjectArtifact, ProjectGeneration, SongProject } from "@/lib/projects/store";

type ProjectPayload = {
  project: SongProject;
  artifacts: ProjectArtifact[];
  generations: ProjectGeneration[];
};

export default function SongProjectPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/projects");
        return;
      }
      const payload = (await res.json()) as ProjectPayload & { error?: string };
      if (!res.ok) {
        if (!cancelled) setError(payload.error ?? "Unable to load song project.");
        return;
      }
      if (!cancelled) {
        setData(payload);
        setTitleDraft(payload.project.title);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  const latestByKind = useMemo(() => {
    const map = new Map<string, ProjectArtifact>();
    for (const artifact of data?.artifacts ?? []) {
      const current = map.get(artifact.kind);
      if (!current || artifact.version > current.version) map.set(artifact.kind, artifact);
    }
    return map;
  }, [data?.artifacts]);

  async function patchProject(patch: Record<string, unknown>): Promise<SongProject | null> {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    const payload = (await res.json()) as { project?: SongProject; error?: string };
    if (!res.ok || !payload.project) {
      setError(payload.error ?? "Unable to update project.");
      return null;
    }
    setData((current) => current ? { ...current, project: payload.project! } : current);
    setTitleDraft(payload.project.title);
    return payload.project;
  }

  async function lockGenerationAndMaster(generationId: string): Promise<void> {
    const updated = await patchProject({
      selectedGenerationId: generationId,
      currentStage: "selected_generation"
    });
    if (updated) {
      router.push(`/?projectId=${data?.project.id ?? projectId}#master`);
    }
  }

  if (error) {
    return (
      <main style={{ minHeight: "100vh", background: "#050505", color: "#fff" }}>
        <MasterSauceBrandNav backHref="/projects" backLabel="← My Songs" />
        <div style={{ width: "min(900px, calc(100% - 32px))", margin: "48px auto" }}>{error}</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ minHeight: "100vh", background: "#050505", color: "#fff" }}>
        <MasterSauceBrandNav backHref="/projects" backLabel="← My Songs" />
        <div style={{ width: "min(900px, calc(100% - 32px))", margin: "48px auto", color: "rgba(255,255,255,.55)" }}>
          Loading song project…
        </div>
      </main>
    );
  }

  const stage = getJourneyStage(data.project.currentStage);
  const earlyStage = ["idea", "song_dna", "lyrics", "suno_prompt"].includes(data.project.currentStage);
  const masteringStage = ["selected_generation", "master"].includes(data.project.currentStage);

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff" }}>
      <MasterSauceBrandNav backHref="/projects" backLabel="← My Songs" />

      <section style={{ width: "min(1180px, calc(100% - 32px))", margin: "0 auto", padding: "34px 0 90px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 520px" }}>
            <div style={{ color: "#6ee7b7", fontSize: 11, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase" }}>
              Song Project · {stage.label}
            </div>
            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                if (titleDraft.trim() && titleDraft.trim() !== data.project.title) {
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
              {stage.description}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {earlyStage ? (
              <Link
                href={`/song-architect?projectId=${data.project.id}`}
                style={{
                  borderRadius: 999,
                  padding: "12px 18px",
                  background: "#34d399",
                  color: "#04120d",
                  fontWeight: 900,
                  textDecoration: "none"
                }}
              >
                Continue in Song Architect →
              </Link>
            ) : null}
            {data.project.currentStage === "analyze_refine" ? (
              <>
                <Link
                  href={`/ar-ai?projectId=${data.project.id}`}
                  style={{
                    borderRadius: 999,
                    padding: "12px 18px",
                    border: "1px solid rgba(255,255,255,.16)",
                    color: "#fff",
                    fontWeight: 800,
                    textDecoration: "none"
                  }}
                >
                  Analyze release readiness
                </Link>
                {data.generations.length === 1 ? (
                  <button
                    type="button"
                    onClick={() => void lockGenerationAndMaster(data.generations[0].id)}
                    style={{
                      border: 0,
                      borderRadius: 999,
                      padding: "12px 18px",
                      background: "#34d399",
                      color: "#04120d",
                      fontWeight: 900,
                      cursor: "pointer"
                    }}
                  >
                    Lock this version → Master
                  </button>
                ) : null}
              </>
            ) : null}
            {masteringStage ? (
              <Link
                href={`/?projectId=${data.project.id}#master`}
                style={{
                  borderRadius: 999,
                  padding: "12px 18px",
                  background: "#fff",
                  color: "#050505",
                  fontWeight: 900,
                  textDecoration: "none"
                }}
              >
                Continue to Mastering →
              </Link>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <JourneyProgress currentStage={data.project.currentStage as JourneyStageId} />
        </div>

        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 18 }}>
          <section style={{ border: "1px solid rgba(255,255,255,.10)", borderRadius: 22, padding: 22, background: "rgba(255,255,255,.03)" }}>
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

          <aside style={{ border: "1px solid rgba(255,255,255,.10)", borderRadius: 22, padding: 22, background: "rgba(255,255,255,.03)" }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Generations</h2>
            <div style={{ marginTop: 12, fontSize: 42, fontWeight: 900 }}>{data.generations.length}</div>
            <div style={{ color: "rgba(255,255,255,.48)", fontSize: 13 }}>Suno candidates attached to this song</div>

            {data.generations.length > 0 ? (
              <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                {data.generations.map((generation, index) => {
                  const selected = data.project.selectedGenerationId === generation.id;
                  return (
                    <div
                      key={generation.id}
                      style={{
                        border: selected
                          ? "1px solid rgba(52,211,153,.48)"
                          : "1px solid rgba(255,255,255,.08)",
                        borderRadius: 14,
                        padding: 12,
                        background: selected ? "rgba(52,211,153,.08)" : "rgba(255,255,255,.02)"
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800 }}>
                        {generation.label || `Generation ${index + 1}`}
                      </div>
                      <div style={{ marginTop: 4, color: "rgba(255,255,255,.38)", fontSize: 11 }}>
                        {selected ? "Locked for mastering" : "Analyzed candidate"}
                      </div>
                      {!selected && data.project.currentStage === "analyze_refine" ? (
                        <button
                          type="button"
                          onClick={() => void lockGenerationAndMaster(generation.id)}
                          style={{
                            marginTop: 10,
                            border: 0,
                            borderRadius: 999,
                            padding: "8px 11px",
                            background: "#34d399",
                            color: "#04120d",
                            fontSize: 12,
                            fontWeight: 900,
                            cursor: "pointer"
                          }}
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
              Audio file durability comes in the next storage milestone. This project already persists candidate metadata and analysis history.
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
