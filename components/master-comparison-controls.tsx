"use client";

import type { CSSProperties } from "react";

import type { ComparisonSource } from "@/lib/master-comparison";
import {
  LOUDNESS_MATCH_HELPER_TEXT,
  LOUDNESS_MATCH_PLAYBACK_ONLY_TEXT
} from "@/lib/master-comparison";

type MasterComparisonControlsProps = {
  activeSource: ComparisonSource;
  loudnessMatchEnabled: boolean;
  loudnessMatchAvailable: boolean;
  onSelectSource: (source: ComparisonSource) => void;
  onLoudnessMatchChange: (enabled: boolean) => void;
};

export function MasterComparisonControls({
  activeSource,
  loudnessMatchEnabled,
  loudnessMatchAvailable,
  onSelectSource,
  onLoudnessMatchChange
}: MasterComparisonControlsProps) {
  return (
    <div data-master-comparison="controls" style={wrapStyle}>
      <h3 style={headingStyle}>Compare</h3>
      <div style={sourceRowStyle} role="group" aria-label="Comparison source">
        <button
          type="button"
          data-master-comparison="original"
          aria-pressed={activeSource === "original"}
          style={activeSource === "original" ? sourceButtonActiveStyle : sourceButtonStyle}
          onClick={() => onSelectSource("original")}
        >
          Original
        </button>
        <button
          type="button"
          data-master-comparison="master"
          aria-pressed={activeSource === "mastered"}
          style={activeSource === "mastered" ? sourceButtonActiveStyle : sourceButtonStyle}
          onClick={() => onSelectSource("mastered")}
        >
          Master
        </button>
      </div>
      <div style={matchRowStyle}>
        <span style={matchLabelStyle}>Loudness Match:</span>
        <button
          type="button"
          role="switch"
          data-master-comparison="loudness-match"
          aria-checked={loudnessMatchEnabled}
          aria-label="Loudness Match"
          style={loudnessMatchEnabled ? matchSwitchOnStyle : matchSwitchOffStyle}
          onClick={() => onLoudnessMatchChange(!loudnessMatchEnabled)}
        >
          {loudnessMatchEnabled ? "ON" : "OFF"}
        </button>
      </div>
      <p style={helperStyle}>{LOUDNESS_MATCH_HELPER_TEXT}</p>
      <p style={playbackOnlyStyle}>{LOUDNESS_MATCH_PLAYBACK_ONLY_TEXT}</p>
      {loudnessMatchEnabled && !loudnessMatchAvailable ? (
        <p style={unavailableStyle}>
          Loudness measurements are unavailable for this pair, so both sides play at their natural levels.
        </p>
      ) : null}
    </div>
  );
}

const wrapStyle: CSSProperties = {
  margin: "0 0 16px",
  textAlign: "center"
};

const headingStyle: CSSProperties = {
  color: "#f1f5ff",
  margin: "0 0 12px",
  fontSize: "1.15rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase"
};

const sourceRowStyle: CSSProperties = {
  display: "inline-flex",
  gap: "8px",
  margin: "0 0 12px",
  padding: "4px",
  borderRadius: "12px",
  background: "rgba(10, 15, 28, 0.62)",
  border: "1px solid rgba(131, 145, 197, 0.26)"
};

const sourceButtonStyle: CSSProperties = {
  minWidth: "108px",
  borderRadius: "9px",
  border: "1px solid transparent",
  background: "transparent",
  color: "#9aa8cf",
  padding: "8px 16px",
  fontWeight: 700,
  cursor: "pointer"
};

const sourceButtonActiveStyle: CSSProperties = {
  ...sourceButtonStyle,
  background: "linear-gradient(125deg, #8b79ff 0%, #5e7dff 100%)",
  border: "1px solid rgba(151, 116, 255, 0.72)",
  color: "#fff"
};

const matchRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  margin: "0 0 8px"
};

const matchLabelStyle: CSSProperties = {
  color: "#dbe2fe",
  fontWeight: 600,
  fontSize: "0.92rem"
};

const matchSwitchOffStyle: CSSProperties = {
  minWidth: "52px",
  borderRadius: "999px",
  border: "1px solid rgba(81, 97, 148, 0.52)",
  background: "rgba(14, 22, 39, 0.9)",
  color: "#c5cdee",
  padding: "4px 10px",
  fontWeight: 800,
  fontSize: "0.78rem",
  letterSpacing: "0.06em",
  cursor: "pointer"
};

const matchSwitchOnStyle: CSSProperties = {
  ...matchSwitchOffStyle,
  background: "linear-gradient(125deg, #8b79ff 0%, #5e7dff 100%)",
  border: "1px solid rgba(151, 116, 255, 0.72)",
  color: "#fff"
};

const helperStyle: CSSProperties = {
  margin: "0 0 4px",
  color: "#9aa8cf",
  fontSize: "0.88rem",
  lineHeight: 1.45
};

const playbackOnlyStyle: CSSProperties = {
  margin: 0,
  color: "#8a97bf",
  fontSize: "0.78rem",
  lineHeight: 1.4
};

const unavailableStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#c4b3ff",
  fontSize: "0.78rem",
  lineHeight: 1.4
};
