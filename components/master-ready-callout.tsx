import type { CSSProperties, ReactNode } from "react";

const DISTROKID_AFFILIATE_URL = "https://distrokid.com/vip/seven/11177062";

export function MasterReadyCallout({ quotaLine }: { quotaLine?: ReactNode }) {
  return (
    <div style={wrapStyle}>
      <div style={accentStripStyle} aria-hidden />
      <div style={innerStyle}>
        <p style={headlineStyle}>Master is dialed in — take a final listen.</p>
        <p style={subtextStyle}>
          Stay in this A/B view as long as you need. When the tone feels release-ready, move to export — that is the only
          step that touches your monthly allowance.
        </p>
        {quotaLine}
        <div style={nextStepSectionStyle}>
          <p style={nextStepLabelStyle}>When you are ready to ship</p>
          <p style={nextStepHeadlineStyle}>Distribution, without the lecture</p>
          <p style={nextStepBodyStyle}>
            If you already like DistroKid, this link jumps you in with the same fast upload flow thousands of bedroom
            producers use. Prefer another distributor? Skip it — your master file is yours either way.
          </p>
          <a
            href={DISTROKID_AFFILIATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={nextStepLinkStyle}
          >
            Release with DistroKid
          </a>
        </div>
      </div>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "stretch",
  borderRadius: "18px",
  border: "1px solid rgba(120, 200, 170, 0.22)",
  background: "linear-gradient(155deg, rgba(18, 42, 36, 0.55) 0%, rgba(12, 20, 38, 0.72) 48%, rgba(10, 16, 32, 0.85) 100%)",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.2) inset, 0 18px 40px rgba(2, 8, 20, 0.35)",
  overflow: "hidden"
};

const accentStripStyle: CSSProperties = {
  flex: "0 0 4px",
  width: "4px",
  minHeight: "100%",
  background: "linear-gradient(180deg, #5ee9b5 0%, #3ad4a0 45%, rgba(58, 212, 160, 0.35) 100%)"
};

const innerStyle: CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  padding: "20px 22px 20px 22px"
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

const nextStepSectionStyle: CSSProperties = {
  marginTop: "18px",
  paddingTop: "18px",
  borderTop: "1px solid rgba(120, 200, 170, 0.12)",
  maxWidth: "520px"
};

const nextStepLabelStyle: CSSProperties = {
  margin: 0,
  color: "rgba(143, 179, 168, 0.72)",
  fontSize: "0.68rem",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  lineHeight: 1.4
};

const nextStepHeadlineStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "rgba(232, 255, 244, 0.92)",
  fontWeight: 600,
  fontSize: "clamp(0.95rem, 1.8vw, 1.05rem)",
  letterSpacing: "-0.015em",
  lineHeight: 1.35
};

const nextStepBodyStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "rgba(143, 179, 168, 0.88)",
  fontSize: "0.82rem",
  lineHeight: 1.55
};

const nextStepLinkStyle: CSSProperties = {
  display: "inline-block",
  marginTop: "12px",
  padding: "6px 0",
  color: "rgba(190, 220, 205, 0.95)",
  fontSize: "0.84rem",
  fontWeight: 500,
  textDecoration: "underline",
  textDecorationColor: "rgba(120, 200, 170, 0.35)",
  textUnderlineOffset: "3px",
  minHeight: "44px",
  lineHeight: 1.4,
  boxSizing: "border-box",
  WebkitTapHighlightColor: "transparent"
};
