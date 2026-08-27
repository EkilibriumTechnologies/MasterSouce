"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { MASTERSOUCE_BILLING_EMAIL_HEADER } from "@/lib/billing/client-key";
import type { ReferenceTrackResult } from "@/components/song-architect/reference-track-panel";
import type { PublicSavedReference } from "@/lib/song-architect/saved-reference";

type Props = {
  refreshNonce: number;
  billingEmail: string;
  onRequireAccess: () => void;
  onUse: (result: ReferenceTrackResult) => void;
};

type ListResponse =
  | { ok: true; references: PublicSavedReference[] }
  | { ok?: false; code?: string; message?: string };

function formatSavedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toTrackResult(item: PublicSavedReference): ReferenceTrackResult {
  return {
    track: {
      id: item.spotifyTrackId,
      title: item.title,
      artists: item.artists,
      album: item.album,
      artworkUrl: item.artworkUrl,
      durationMs: item.blueprint.source.durationMs ?? 0,
      url: item.spotifyUrl ?? item.blueprint.source.spotifyUrl ?? ""
    },
    blueprint: item.blueprint
  };
}

export function MyReferencesPanel({ refreshNonce, billingEmail, onRequireAccess, onUse }: Props) {
  const [references, setReferences] = useState<PublicSavedReference[]>([]);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!billingEmail) {
      setNeedsAccess(true);
      setReferences([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    void (async () => {
      try {
        const response = await fetch("/api/song-architect/references", {
          headers: {
            [MASTERSOUCE_BILLING_EMAIL_HEADER]: billingEmail
          }
        });
        const data = (await response.json()) as ListResponse;
        if (cancelled) return;
        if (response.status === 403 && data && "code" in data && data.code === "email_verification_required") {
          setNeedsAccess(true);
          setReferences([]);
          return;
        }
        if (!response.ok || data.ok !== true) {
          setNeedsAccess(false);
          setError(data && "message" in data && typeof data.message === "string" ? data.message : "Could not load saved references.");
          return;
        }
        setNeedsAccess(false);
        setReferences(data.references);
      } catch {
        if (!cancelled) {
          setNeedsAccess(false);
          setError("Could not load saved references right now.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [billingEmail, refreshNonce]);

  async function removeReference(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setError("");
    try {
      const headers: Record<string, string> = {};
      if (billingEmail) {
        headers[MASTERSOUCE_BILLING_EMAIL_HEADER] = billingEmail;
      }
      const response = await fetch(`/api/song-architect/references/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers
      });
      const data = (await response.json()) as { ok?: boolean; code?: string; message?: string };
      if (response.status === 403 && data.code === "email_verification_required") {
        setNeedsAccess(true);
        onRequireAccess();
        return;
      }
      if (!response.ok || data.ok === false) {
        setError(typeof data.message === "string" ? data.message : "Could not remove that reference.");
        return;
      }
      setReferences((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("Could not remove that reference right now.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section style={sectionStyle} aria-label="My References">
      <p style={headingStyle}>My References</p>
      <p style={hintStyle}>Reuse a saved creative direction.</p>
      <p style={privacyStyle}>Private to your verified email.</p>
      {needsAccess ? (
        <button type="button" style={accessButtonStyle} onClick={onRequireAccess}>
          Confirm email access
        </button>
      ) : null}
      {!needsAccess && isLoading ? <p style={mutedStyle}>Loading saved references…</p> : null}
      {!needsAccess && !isLoading && references.length === 0 && !error ? (
        <p style={mutedStyle}>No saved references yet.</p>
      ) : null}
      {error ? <p style={errorStyle}>{error}</p> : null}
      {!needsAccess ? (
        <ul style={listStyle}>
          {references.map((item) => {
            const savedLabel = formatSavedDate(item.updatedAt);
            return (
              <li key={item.id} style={itemStyle}>
                {item.artworkUrl ? (
                  <Image src={item.artworkUrl} alt="" width={48} height={48} style={artworkStyle} />
                ) : (
                  <div style={artworkFallbackStyle} aria-hidden="true" />
                )}
                <div style={itemBodyStyle}>
                  <p style={titleStyle}>{item.title}</p>
                  <p style={metaStyle}>{item.artists.join(", ")}</p>
                  <p style={summaryStyle}>{item.creativeSummary}</p>
                  {savedLabel ? <p style={dateStyle}>Saved {savedLabel}</p> : null}
                  <div style={itemActionsStyle}>
                    <button type="button" style={useButtonStyle} onClick={() => onUse(toTrackResult(item))}>
                      Use Reference
                    </button>
                    <button
                      type="button"
                      style={removeButtonStyle}
                      onClick={() => void removeReference(item.id)}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  marginTop: "10px",
  padding: "10px 12px",
  borderRadius: "14px",
  border: "1px solid rgba(118, 136, 210, 0.18)",
  background: "rgba(12, 18, 34, 0.45)"
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  color: "#c9d7ff",
  fontWeight: 700,
  fontSize: "0.82rem",
  letterSpacing: "0.02em"
};

const hintStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#a7b6dc",
  fontSize: "0.78rem",
  lineHeight: 1.45
};

const privacyStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#8fa0cf",
  fontSize: "0.72rem",
  lineHeight: 1.4
};

const accessButtonStyle: React.CSSProperties = {
  marginTop: "10px",
  border: "1px solid rgba(136, 154, 212, 0.42)",
  borderRadius: "999px",
  background: "rgba(13, 21, 40, 0.9)",
  color: "#b4c3ec",
  fontWeight: 600,
  padding: "8px 14px",
  cursor: "pointer"
};

const mutedStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#95a4d2",
  fontSize: "0.82rem"
};

const errorStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#ffbac8",
  fontWeight: 600,
  fontSize: "0.88rem"
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: "10px 0 0",
  padding: 0,
  display: "grid",
  gap: "10px"
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "flex-start"
};

const artworkStyle: React.CSSProperties = {
  borderRadius: "8px",
  objectFit: "cover",
  flexShrink: 0
};

const artworkFallbackStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: "8px",
  background: "rgba(30, 40, 70, 0.8)",
  flexShrink: 0
};

const itemBodyStyle: React.CSSProperties = {
  minWidth: 0,
  flex: 1
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f1f4ff",
  fontWeight: 700,
  fontSize: "0.86rem"
};

const metaStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#a7b6dc",
  fontSize: "0.78rem"
};

const summaryStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#c9d7ff",
  fontSize: "0.78rem",
  lineHeight: 1.45
};

const dateStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#8fa0cf",
  fontSize: "0.72rem"
};

const itemActionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  marginTop: "8px"
};

const useButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(141, 232, 203, 0.45)",
  borderRadius: "999px",
  background: "rgba(18, 36, 40, 0.88)",
  color: "#8de8cb",
  fontWeight: 700,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "0.78rem"
};

const removeButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(136, 154, 212, 0.35)",
  borderRadius: "999px",
  background: "transparent",
  color: "#b4c3ec",
  fontWeight: 600,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "0.78rem"
};
