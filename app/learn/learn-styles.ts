import type { CSSProperties } from "react";

export const mainStyle: CSSProperties = {
  maxWidth: "860px",
  margin: "0 auto",
  padding: "28px clamp(20px, 4vw, 36px) 88px",
  color: "#eef2ff",
  fontFamily: "inherit",
  boxSizing: "border-box"
};

export const topNavStyle: CSSProperties = {
  margin: "0 0 28px",
  padding: "0 2px",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "6px 12px",
  fontSize: "0.92rem",
  fontWeight: 600
};

export const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "44px",
  padding: "8px 10px 8px 4px",
  marginLeft: "-4px",
  fontFamily: "inherit",
  fontSize: "0.92rem",
  fontWeight: 600,
  textDecoration: "none",
  letterSpacing: "0.01em",
  color: "rgba(142, 160, 208, 0.88)"
};

export const navMutedStyle: CSSProperties = {
  color: "rgba(142, 160, 208, 0.45)",
  userSelect: "none"
};

export const heroStyle: CSSProperties = {
  textAlign: "center",
  padding: "clamp(36px, 6vw, 52px) clamp(22px, 4vw, 40px)",
  marginBottom: "clamp(40px, 6vw, 56px)",
  borderRadius: "28px",
  border: "1px solid rgba(74, 90, 150, 0.22)",
  boxShadow: "0 24px 56px rgba(4, 7, 16, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
  background:
    "radial-gradient(800px 280px at 50% -20%, rgba(155, 111, 255, 0.28), rgba(155, 111, 255, 0) 60%), radial-gradient(700px 400px at 0% 0%, rgba(46, 177, 255, 0.1), rgba(46, 177, 255, 0) 58%), linear-gradient(145deg, #121a32 0%, #0d1428 52%, #090f1f 100%)"
};

export const eyebrowStyle: CSSProperties = {
  margin: "0 0 16px",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#8eb4ff"
};

export const h1Style: CSSProperties = {
  margin: "0 auto 18px",
  maxWidth: "22ch",
  fontSize: "clamp(2rem, 4.5vw, 2.75rem)",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: 1.12,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  color: "#f1f4ff"
};

export const introStyle: CSSProperties = {
  margin: "0 auto",
  maxWidth: "52ch",
  fontSize: "1.0625rem",
  lineHeight: 1.68,
  color: "#9ca8cc",
  textAlign: "left"
};

export const articleStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "22px",
  maxWidth: "52rem",
  margin: "0 auto"
};

export const pStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.0625rem",
  lineHeight: 1.78,
  color: "#b9c2e6"
};

export const h2Style: CSSProperties = {
  margin: "10px 0 0",
  fontSize: "clamp(1.35rem, 2.5vw, 1.65rem)",
  fontWeight: 700,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  color: "#f1f4ff",
  letterSpacing: "-0.02em",
  lineHeight: 1.25
};

export const h3Style: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "1.125rem",
  fontWeight: 700,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  color: "#e4e9ff",
  lineHeight: 1.35
};

export const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.35rem",
  fontSize: "1.0625rem",
  lineHeight: 1.78,
  color: "#b9c2e6"
};

export const listItemStyle: CSSProperties = {
  marginBottom: "8px"
};

export const inlineLinkStyle: CSSProperties = {
  color: "#a8b8f0",
  textDecoration: "underline",
  textDecorationColor: "rgba(143, 160, 230, 0.45)",
  textUnderlineOffset: "3px"
};

export const ctaSectionStyle: CSSProperties = {
  marginTop: "clamp(48px, 8vw, 72px)",
  padding: "clamp(32px, 5vw, 44px) clamp(24px, 4vw, 36px)",
  textAlign: "center",
  borderRadius: "24px",
  border: "1px solid rgba(142, 155, 209, 0.2)",
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.94), rgba(12, 17, 30, 0.94))",
  boxShadow: "0 18px 40px rgba(2, 4, 12, 0.45)"
};

export const ctaHeadingStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "clamp(1.5rem, 3vw, 1.85rem)",
  fontWeight: 700,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  color: "#f1f4ff",
  letterSpacing: "-0.02em"
};

export const ctaBodyStyle: CSSProperties = {
  margin: "0 auto 24px",
  maxWidth: "42ch",
  fontSize: "1rem",
  lineHeight: 1.65,
  color: "#9ca8cc"
};

export const ctaRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: "12px"
};

export const ctaPrimaryStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  borderRadius: "999px",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  boxShadow: "0 14px 36px rgba(121, 100, 255, 0.45)",
  color: "#ffffff",
  fontWeight: 700,
  padding: "15px 36px"
};

export const ctaSecondaryStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  borderRadius: "999px",
  border: "1px solid rgba(136, 154, 212, 0.5)",
  color: "#d6defa",
  fontWeight: 600,
  padding: "14px 28px",
  background: "rgba(13, 21, 40, 0.65)"
};

export const articleCardListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  marginTop: "8px",
  listStyle: "none",
  padding: 0
};

export const articleCardStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid rgba(74, 90, 150, 0.28)",
  background: "linear-gradient(155deg, rgba(19, 28, 52, 0.72), rgba(12, 19, 37, 0.78))",
  padding: "22px 22px 20px",
  boxShadow: "0 12px 32px rgba(2, 4, 12, 0.35)"
};

export const articleCardTitleStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: "1.15rem",
  fontWeight: 700,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};

export const articleCardTitleLinkStyle: CSSProperties = {
  color: "#e8ecff",
  textDecoration: "none"
};

export const articleCardDescStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "0.98rem",
  lineHeight: 1.65,
  color: "#9ca8cc"
};

export const articleCardReadStyle: CSSProperties = {
  fontSize: "0.92rem",
  fontWeight: 600,
  color: "#a8b8f0",
  textDecoration: "none"
};

export const articleCardMetaRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "6px 10px",
  margin: "0 0 12px",
  fontSize: "0.8rem",
  color: "rgba(156, 168, 204, 0.92)"
};

export const articleCardMetaDotStyle: CSSProperties = {
  color: "rgba(142, 160, 208, 0.45)",
  userSelect: "none"
};

export const featuredPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  border: "1px solid rgba(143, 98, 255, 0.5)",
  background: "rgba(104, 87, 199, 0.2)",
  color: "#d9ccff",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "4px 9px"
};
