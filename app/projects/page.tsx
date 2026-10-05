"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MasterSauceBrandNav } from "@/components/brand/mastersauce-brand-header";
import { getJourneyStage } from "@/lib/journeys/stages";
import type { SongProject } from "@/lib/projects/types";

type AccountUser = { id: string; email: string };

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That sign-in link is invalid or expired. Request a new one below.",
  rate_limited: "Too many sign-in attempts. Please wait a bit and try again.",
  account_unavailable: "We verified your email but couldn't open your account. Please try again shortly."
};
type ViewState = "loading" | "anonymous" | "authenticated" | "error";

export default function ProjectsPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>("loading");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [projects, setProjects] = useState<SongProject[]>([]);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
      const session = (await sessionRes.json()) as {
        authenticated?: boolean;
        user?: AccountUser | null;
      };
      if (!sessionRes.ok || !session.authenticated || !session.user) {
        setUser(null);
        setProjects([]);
        setView("anonymous");
        return;
      }

      const projectsRes = await fetch("/api/projects", { cache: "no-store" });
      const payload = (await projectsRes.json()) as { projects?: SongProject[] };
      if (!projectsRes.ok) throw new Error("Unable to load your songs.");

      setUser(session.user);
      setProjects(payload.projects ?? []);
      setView("authenticated");
    } catch {
      setView("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // /auth/confirm redirects here with ?auth_error=… when a sign-in link can't be verified.
    const code = new URLSearchParams(window.location.search).get("auth_error");
    if (code) setAuthMessage(AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.invalid_link);
    if (code || window.location.hash) window.history.replaceState({}, "", "/projects");
  }, []);

  async function requestMagicLink(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setAuthMessage("");
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to send sign-in link.");
      setAuthMessage(payload.message ?? "Check your email for the sign-in link.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Unable to send sign-in link.");
    } finally {
      setBusy(false);
    }
  }

  async function createProject() {
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = (await res.json()) as { project?: SongProject; error?: string };
      if (!res.ok || !payload.project) {
        throw new Error(payload.error ?? "Unable to create song.");
      }
      router.push(`/projects/${payload.project.id}`);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Unable to create song.");
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setProjects([]);
    setView("anonymous");
  }

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff" }}>
      <MasterSauceBrandNav
        backHref="/"
        backLabel="← MasterSauce"
        trailing={
          view === "authenticated" ? (
            <button
              type="button"
              onClick={() => void logout()}
              style={{
                border: "1px solid rgba(255,255,255,.14)",
                borderRadius: 999,
                background: "transparent",
                color: "rgba(255,255,255,.72)",
                padding: "8px 12px",
                cursor: "pointer"
              }}
            >
              Sign out
            </button>
          ) : null
        }
      />

      <section style={{ width: "min(1120px, calc(100% - 32px))", margin: "0 auto", padding: "44px 0 80px" }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ color: "#6ee7b7", fontSize: 12, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase" }}>
            Song Projects
          </div>
          <h1 style={{ margin: "10px 0 12px", fontSize: "clamp(34px, 6vw, 68px)", lineHeight: 1.02 }}>
            My Songs
          </h1>
          <p style={{ margin: 0, color: "rgba(255,255,255,.62)", fontSize: 16, lineHeight: 1.7 }}>
            One place for the whole journey — idea, Song DNA, lyrics, Suno prompt, generation refinement, mastering, and export.
          </p>
        </div>

        {view === "loading" ? (
          <p style={{ marginTop: 36, color: "rgba(255,255,255,.55)" }}>Loading your songs…</p>
        ) : null}

        {view === "error" ? (
          <div style={{ marginTop: 36, border: "1px solid rgba(248,113,113,.3)", borderRadius: 20, padding: 22 }}>
            Unable to load My Songs right now.
          </div>
        ) : null}

        {view === "anonymous" ? (
          <div style={{ marginTop: 36, maxWidth: 560, border: "1px solid rgba(255,255,255,.10)", borderRadius: 24, padding: 24, background: "rgba(255,255,255,.035)" }}>
            <h2 style={{ margin: 0, fontSize: 24 }}>Sign in to keep your songs</h2>
            <p style={{ color: "rgba(255,255,255,.58)", lineHeight: 1.6 }}>
              We’ll email you a secure sign-in link. No password to remember.
            </p>
            <form onSubmit={requestMagicLink} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                style={{
                  flex: "1 1 280px",
                  minWidth: 0,
                  border: "1px solid rgba(255,255,255,.14)",
                  background: "#111",
                  color: "#fff",
                  borderRadius: 14,
                  padding: "13px 14px",
                  fontSize: 15
                }}
              />
              <button
                type="submit"
                disabled={busy}
                style={{
                  border: 0,
                  borderRadius: 14,
                  padding: "13px 18px",
                  fontWeight: 800,
                  background: "#fff",
                  color: "#050505",
                  cursor: busy ? "wait" : "pointer"
                }}
              >
                {busy ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
            {authMessage ? (
              <p style={{ marginBottom: 0, color: "#a7f3d0", fontSize: 14 }}>{authMessage}</p>
            ) : null}
          </div>
        ) : null}

        {view === "authenticated" ? (
          <>
            <div style={{ marginTop: 34, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ color: "rgba(255,255,255,.5)", fontSize: 13 }}>
                Signed in as {user?.email}
              </div>
              <button
                type="button"
                onClick={() => void createProject()}
                disabled={busy}
                style={{
                  border: 0,
                  borderRadius: 999,
                  padding: "12px 18px",
                  background: "#34d399",
                  color: "#04120d",
                  fontWeight: 900,
                  cursor: busy ? "wait" : "pointer"
                }}
              >
                + New Song
              </button>
            </div>

            {projects.length === 0 ? (
              <button
                type="button"
                onClick={() => void createProject()}
                style={{
                  marginTop: 28,
                  width: "100%",
                  border: "1px dashed rgba(255,255,255,.18)",
                  borderRadius: 24,
                  background: "rgba(255,255,255,.025)",
                  color: "#fff",
                  padding: "42px 24px",
                  textAlign: "left",
                  cursor: "pointer"
                }}
              >
                <strong style={{ display: "block", fontSize: 22 }}>Start your first song</strong>
                <span style={{ display: "block", marginTop: 8, color: "rgba(255,255,255,.56)" }}>
                  MasterSauce will keep the project together from the first idea through the final master.
                </span>
              </button>
            ) : (
              <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                {projects.map((project) => {
                  const stage = getJourneyStage(project.currentStage);
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => router.push(`/projects/${project.id}`)}
                      style={{
                        border: "1px solid rgba(255,255,255,.10)",
                        borderRadius: 22,
                        background: "rgba(255,255,255,.035)",
                        color: "#fff",
                        padding: 20,
                        textAlign: "left",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ color: "#6ee7b7", fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" }}>
                        {stage.label}
                      </div>
                      <div style={{ marginTop: 9, fontSize: 21, fontWeight: 800 }}>{project.title}</div>
                      <div style={{ marginTop: 8, color: "rgba(255,255,255,.52)", fontSize: 13, lineHeight: 1.5 }}>
                        {stage.description}
                      </div>
                      <div style={{ marginTop: 18, color: "rgba(255,255,255,.36)", fontSize: 11 }}>
                        Updated {new Date(project.updatedAt).toLocaleDateString()}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {authMessage ? (
              <p style={{ color: "#fca5a5", marginTop: 18 }}>{authMessage}</p>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
