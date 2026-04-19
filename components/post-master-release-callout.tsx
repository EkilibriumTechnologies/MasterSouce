import type { CSSProperties } from "react";

const DISTROKID_AFFILIATE_URL = "https://distrokid.com/vip/seven/11177062";

const wrapStyle: CSSProperties = {
  width: "100%",
  maxWidth: "min(100%, 460px)",
  boxSizing: "border-box",
  borderRadius: "16px",
  border: "1px solid rgba(108, 124, 188, 0.28)",
  background:
    "linear-gradient(165deg, rgba(22, 28, 48, 0.55) 0%, rgba(14, 18, 34, 0.72) 55%, rgba(10, 14, 26, 0.82) 100%)",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.18) inset, 0 12px 32px rgba(4, 8, 22, 0.28)",
  padding: "clamp(16px, 3.5vw, 20px) clamp(18px, 3.5vw, 22px)",
  textAlign: "left"
};

const kickerStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "0.68rem",
  letterSpacing: "0.11em",
  textTransform: "uppercase",
  fontWeight: 600,
  color: "rgba(154, 168, 214, 0.85)"
};

const headlineStyle: CSSProperties = {
  margin: 0,
  color: "#eef2ff",
  fontWeight: 600,
  fontSize: "clamp(1rem, 2.4vw, 1.12rem)",
  letterSpacing: "-0.02em",
  lineHeight: 1.35
};

const bodyStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "rgba(178, 190, 228, 0.92)",
  fontSize: "0.86rem",
  lineHeight: 1.55
};

const ctaRowStyle: CSSProperties = {
  marginTop: "14px",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "10px"
};

const ctaLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "44px",
  padding: "10px 16px",
  borderRadius: "12px",
  border: "1px solid rgba(130, 148, 210, 0.45)",
  background: "rgba(255, 255, 255, 0.04)",
  color: "#e6ebff",
  fontWeight: 600,
  fontSize: "0.88rem",
  textDecoration: "none",
  transition: "border-color 160ms ease, background 160ms ease, color 160ms ease",
  boxSizing: "border-box"
};

export function PostMasterReleaseCallout() {
  return (
    <aside style={wrapStyle} aria-label="Recommended distribution next step">
      <p style={kickerStyle}>Ready when you are</p>
      <h3 style={headlineStyle}>Handoff to distribution</h3>
      <p style={bodyStyle}>
        Master is finished in MasterSauce. If you want a simple route to Spotify, Apple Music, or TikTok, DistroKid is a
        common pick for independents — open it only if it matches how you already release.
      </p>
      <div style={ctaRowStyle}>
        <a
          href={DISTROKID_AFFILIATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={ctaLinkStyle}
          aria-label="Release with DistroKid (opens in a new tab)"
        >
          Release with DistroKid
          <span style={{ marginLeft: "6px", opacity: 0.75 }} aria-hidden>
            ↗
          </span>
        </a>
      </div>
    </aside>
  );
}
