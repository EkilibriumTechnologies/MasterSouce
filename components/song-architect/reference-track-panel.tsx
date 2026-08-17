"use client";

import Image from "next/image";
import { useState } from "react";
import {
  deriveSongArchitectGuidanceFromBlueprint,
  formatLikelyTempoLabel,
  REFERENCE_STYLE_DISCLAIMER,
  type ReferenceStyleBlueprint
} from "@/lib/song-architect/reference-style-blueprint";

export type ReferenceTrackResult = {
  track: {
    id: string;
    title: string;
    artists: string[];
    album?: string | null;
    artworkUrl?: string | null;
    durationMs: number;
    url: string;
  };
  blueprint: ReferenceStyleBlueprint;
};

type Props = {
  attached: boolean;
  onUse: (result: ReferenceTrackResult) => void;
  onClear: () => void;
};

type AnalyzeResponse =
  | { ok: true; track: ReferenceTrackResult["track"]; blueprint: ReferenceStyleBlueprint }
  | { ok: false; code?: string; message?: string };

function joinList(values: string[]): string {
  return values.filter(Boolean).join(" · ");
}

function inferredLabel(value: number | null, suffix = "/100"): string {
  return value === null ? "Not inferred" : `Inferred feel ${value}${suffix}`;
}

export function ReferenceTrackPanel({ attached, onUse, onClear }: Props) {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReferenceTrackResult | null>(null);

  async function analyzeReference() {
    setError("");
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/song-architect/reference-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = (await response.json()) as AnalyzeResponse;
      if (!response.ok || data.ok === false) {
        setResult(null);
        const message = !data.ok && typeof data.message === "string" ? data.message : "Could not interpret that reference track.";
        setError(message);
        return;
      }
      setResult({ track: data.track, blueprint: data.blueprint });
    } catch {
      setResult(null);
      setError("Could not interpret that reference track right now.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  const interpretation = result?.blueprint.interpretation;
  const tempoLabel = result ? formatLikelyTempoLabel(result.blueprint) : null;

  return (
    <section style={sectionStyle} aria-label="Reference Track">
      <p style={headingStyle}>Reference Track</p>
      <p style={hintStyle}>
        Paste a Spotify track URL to get a Style Blueprint inspired by its musical characteristics. Song Architect will
        use it to create something original — not a copy of the recording.
      </p>
      <label style={labelStyle}>
        Spotify track URL
        <input
          style={inputStyle}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://open.spotify.com/track/..."
          autoComplete="off"
        />
      </label>
      <div style={actionsStyle}>
        <button type="button" style={buttonStyle} onClick={() => void analyzeReference()} disabled={isAnalyzing || !url.trim()}>
          {isAnalyzing ? "Interpreting..." : "Analyze Reference"}
        </button>
        {attached || result ? (
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => {
              setResult(null);
              setError("");
              onClear();
            }}
          >
            Clear reference
          </button>
        ) : null}
      </div>
      {error ? <p style={errorStyle}>{error}</p> : null}

      {result && interpretation ? (
        <div style={resultStyle}>
          <div style={trackRowStyle}>
            {result.track.artworkUrl ? (
              <Image
                src={result.track.artworkUrl}
                alt=""
                width={72}
                height={72}
                style={artworkStyle}
              />
            ) : (
              <div style={artworkFallbackStyle} aria-hidden="true" />
            )}
            <div>
              <p style={trackTitleStyle}>{result.track.title}</p>
              <p style={trackArtistStyle}>{result.track.artists.join(", ")}</p>
              {result.track.album ? <p style={trackArtistStyle}>{result.track.album}</p> : null}
            </div>
          </div>

          <p style={summaryStyle}>{interpretation.creativeSummary}</p>
          <p style={rowStyle}>
            <strong style={keyStyle}>Genre direction:</strong> {joinList(interpretation.genreDirection) || "Not inferred"}
          </p>
          <p style={rowStyle}>
            <strong style={keyStyle}>Mood:</strong> {joinList(interpretation.mood) || "Not inferred"}
          </p>
          <p style={rowStyle}>
            <strong style={keyStyle}>Energy:</strong> {inferredLabel(interpretation.energy)}
          </p>
          <p style={rowStyle}>
            <strong style={keyStyle}>Production palette:</strong> {joinList(interpretation.productionPalette) || "Not inferred"}
          </p>
          <p style={rowStyle}>
            <strong style={keyStyle}>Rhythmic character:</strong> {joinList(interpretation.rhythmicCharacter) || "Not inferred"}
          </p>
          <p style={rowStyle}>
            <strong style={keyStyle}>Vocal character:</strong> {joinList(interpretation.vocalCharacter) || "Not inferred"}
          </p>
          <p style={rowStyle}>
            <strong style={keyStyle}>Arrangement direction:</strong>{" "}
            {joinList(interpretation.arrangementDirection) || "Not inferred"}
          </p>
          <p style={rowStyle}>
            <strong style={keyStyle}>Likely tempo feel:</strong> {tempoLabel ?? "Not inferred"}
          </p>
          <p style={rowStyle}>
            <strong style={keyStyle}>Tonal character:</strong> {interpretation.likelyTonalCharacter ?? "Not inferred"}
          </p>
          <p style={provenanceStyle}>{REFERENCE_STYLE_DISCLAIMER}</p>
          <button
            type="button"
            style={useButtonStyle}
            onClick={() => onUse(result)}
          >
            {attached ? "Using as Song Architect Reference" : "Use as Song Architect Reference"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function emptyFieldsFromBlueprint(blueprint: ReferenceStyleBlueprint): {
  genre?: string;
  emotion?: string;
  vocalStyle?: string;
  structure?: string;
  energyCurve?: string;
} {
  const guidance = deriveSongArchitectGuidanceFromBlueprint(blueprint);
  return {
    ...(guidance.genre ? { genre: guidance.genre } : {}),
    ...(guidance.emotion ? { emotion: guidance.emotion } : {}),
    ...(guidance.vocalStyle ? { vocalStyle: guidance.vocalStyle } : {}),
    ...(guidance.structure ? { structure: guidance.structure } : {}),
    ...(guidance.energyCurve ? { energyCurve: guidance.energyCurve } : {})
  };
}

const sectionStyle: React.CSSProperties = {
  marginTop: "12px",
  padding: "12px",
  borderRadius: "14px",
  border: "1px solid rgba(118, 136, 210, 0.35)",
  background: "linear-gradient(155deg, rgba(18, 26, 48, 0.95), rgba(10, 16, 32, 0.88))"
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  color: "#e8edff",
  fontWeight: 700,
  fontSize: "0.88rem",
  letterSpacing: "0.02em"
};

const hintStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#a7b6dc",
  fontSize: "0.82rem",
  lineHeight: 1.5
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
  marginTop: "10px",
  color: "#cad6f6",
  fontSize: "0.82rem"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "10px",
  border: "1px solid rgba(84, 104, 156, 0.4)",
  background: "rgba(11, 18, 35, 0.72)",
  color: "#e7edff",
  padding: "10px 11px",
  fontSize: "0.9rem"
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginTop: "10px"
};

const buttonStyle: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  borderRadius: "999px",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  color: "#fff",
  fontWeight: 700,
  padding: "8px 14px"
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(136, 154, 212, 0.42)",
  borderRadius: "999px",
  background: "rgba(13, 21, 40, 0.9)",
  color: "#b4c3ec",
  fontWeight: 600,
  padding: "8px 14px",
  cursor: "pointer"
};

const errorStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#ffbac8",
  fontWeight: 600,
  fontSize: "0.88rem"
};

const resultStyle: React.CSSProperties = {
  marginTop: "12px",
  display: "grid",
  gap: "4px"
};

const trackRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "center"
};

const artworkStyle: React.CSSProperties = {
  borderRadius: "8px",
  objectFit: "cover"
};

const artworkFallbackStyle: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: "8px",
  background: "rgba(30, 40, 70, 0.8)"
};

const trackTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f1f4ff",
  fontWeight: 700
};

const trackArtistStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#a7b6dc",
  fontSize: "0.84rem"
};

const summaryStyle: React.CSSProperties = {
  margin: "10px 0 4px",
  color: "#dfe8ff",
  lineHeight: 1.5,
  fontSize: "0.88rem"
};

const rowStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#dfe8ff",
  fontSize: "0.84rem",
  lineHeight: 1.45
};

const keyStyle: React.CSSProperties = {
  color: "#9fb3e7"
};

const provenanceStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#8de8cb",
  fontSize: "0.78rem",
  lineHeight: 1.45
};

const useButtonStyle: React.CSSProperties = {
  marginTop: "10px",
  border: "1px solid rgba(141, 232, 203, 0.45)",
  borderRadius: "999px",
  background: "rgba(18, 36, 40, 0.88)",
  color: "#8de8cb",
  fontWeight: 700,
  padding: "8px 14px",
  cursor: "pointer",
  justifySelf: "start"
};
