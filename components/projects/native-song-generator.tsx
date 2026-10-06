"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Usage = {
  used: number;
  limit: number;
  remaining: number;
};

type AccessPayload = {
  ok?: boolean;
  planId?: string;
  eligible?: boolean;
  configured?: boolean;
  usage?: Usage;
  code?: string;
  message?: string;
};

type GeneratePayload = AccessPayload & {
  audioUrl?: string;
  generation?: { id?: string; label?: string | null };
};

export function NativeSongGenerator({
  projectId,
  onGenerated
}: {
  projectId: string;
  onGenerated?: () => void;
}) {
  const [access, setAccess] = useState<AccessPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  async function loadAccess() {
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/generate-song`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => ({}))) as AccessPayload;
      setAccess(payload);
    } catch {
      setAccess({ ok: false, message: "Unable to check native generation access." });
    }
  }

  useEffect(() => {
    void loadAccess();
  }, [projectId]);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setAudioUrl("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/generate-song`,
        { method: "POST" }
      );
      const payload = (await response.json().catch(() => ({}))) as GeneratePayload;
      if (!response.ok || !payload.audioUrl) {
        throw new Error(payload.message ?? "Unable to generate song.");
      }
      setAudioUrl(payload.audioUrl);
      if (payload.usage) {
        setAccess((current) => ({
          ...(current ?? {}),
          ok: true,
          planId: "pro_studio_monthly",
          eligible: payload.usage!.remaining > 0,
          configured: true,
          usage: payload.usage
        }));
      }
      setMessage("Generation saved to this Song Journey.");
      onGenerated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate song.");
      await loadAccess();
    } finally {
      setBusy(false);
    }
  }

  const planId = access?.planId ?? "free";
  const usage = access?.usage;
  const isPro = planId === "pro_studio_monthly";
  const configured = access?.configured === true;

  return (
    <section
      style={{
        marginTop: 18,
        border: "1px solid rgba(52,211,153,.24)",
        borderRadius: 22,
        padding: 22,
        background: "linear-gradient(180deg, rgba(52,211,153,.07), rgba(255,255,255,.025))"
      }}
      aria-label="Generate inside MasterSauce"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 700 }}>
          <div style={{ color: "#6ee7b7", fontSize: 11, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase" }}>
            Pro Studio
          </div>
          <h2 style={{ margin: "7px 0 8px", fontSize: 22 }}>Generate inside MasterSauce</h2>
          <p style={{ margin: 0, color: "rgba(255,255,255,.58)", lineHeight: 1.65 }}>
            Turn this Song Architect blueprint into a complete vocal song without leaving the Journey. Suno export stays available below.
          </p>
        </div>

        {isPro ? (
          <button
            type="button"
            disabled={busy || !configured || !usage || usage.remaining <= 0}
            onClick={() => void generate()}
            style={{
              border: 0,
              borderRadius: 999,
              padding: "12px 18px",
              background: busy || !configured || !usage || usage.remaining <= 0 ? "rgba(255,255,255,.12)" : "#34d399",
              color: busy || !configured || !usage || usage.remaining <= 0 ? "rgba(255,255,255,.5)" : "#04120d",
              fontWeight: 900,
              cursor: busy ? "wait" : "pointer"
            }}
          >
            {busy ? "Generating song…" : "Generate song"}
          </button>
        ) : (
          <Link
            href={`/pricing?returnTo=${encodeURIComponent(`/projects/${projectId}`)}`}
            style={{
              borderRadius: 999,
              padding: "12px 18px",
              background: "#fff",
              color: "#050505",
              fontWeight: 900,
              textDecoration: "none"
            }}
          >
            Upgrade to Pro Studio
          </Link>
        )}
      </div>

      {isPro && usage ? (
        <p style={{ margin: "14px 0 0", color: "rgba(255,255,255,.48)", fontSize: 12 }}>
          {usage.remaining} of {usage.limit} native song generations remaining this month.
        </p>
      ) : null}

      {isPro && !configured ? (
        <p style={{ margin: "14px 0 0", color: "#fcd34d", fontSize: 13 }}>
          Native generation is not enabled on this deployment yet. Your Suno workflow remains available.
        </p>
      ) : null}

      {message ? (
        <p role="status" style={{ margin: "14px 0 0", color: message.startsWith("Generation saved") ? "#a7f3d0" : "#fca5a5", fontSize: 13 }}>
          {message}
        </p>
      ) : null}

      {audioUrl ? (
        <audio
          controls
          preload="metadata"
          src={audioUrl}
          style={{ width: "100%", marginTop: 14 }}
        >
          Your browser does not support audio playback.
        </audio>
      ) : null}
    </section>
  );
}
