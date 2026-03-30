import type { CSSProperties, ReactNode } from "react";

export function MasterReadyCallout({ quotaLine }: { quotaLine?: ReactNode }) {
  return (
    <div style={wrapStyle}>
      <div style={accentBarStyle} aria-hidden />
      <div style={innerStyle}>
        <p style={headlineStyle}>Your track is ready for streaming.</p>
        <p style={subtextStyle}>Preview with A/B playback as much as you want. Only final mastered exports count.</p>
        {quotaLine}
      </div>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  position: "relative",
  borderRadius: "18px",
  border: "1px solid rgba(120, 200, 170, 0.22)",
  background: "linear-gradient(155deg, rgba(18, 42, 36, 0.55) 0%, rgba(12, 20, 38, 0.72) 48%, rgba(10, 16, 32, 0.85) 100%)",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.2) inset, 0 18px 40px rgba(2, 8, 20, 0.35)",
  overflow: "hidden"
};

const accentBarStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  width: "4px",
  background: "linear-gradient(180deg, #5ee9b5 0%, #3ad4a0 45%, rgba(58, 212, 160, 0.35) 100%)",
  borderRadius: "18px 0 0 18px"
};

const innerStyle: CSSProperties = {
  padding: "20px 22px 20px 26px"
};

const headlineStyle: CSSProperties = {
  margin: 0,
  color: "#e8fff4",
  fontWeight: 700,
  fontSize: "clamp(1.05rem, 2.2vw, 1.25rem)",
  letterSpacing: "-0.02em",
  lineHeight: 1.35
};

const subtextStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#8fb3a8",
  fontSize: "0.88rem",
  lineHeight: 1.55,
  maxWidth: "520px"
};
