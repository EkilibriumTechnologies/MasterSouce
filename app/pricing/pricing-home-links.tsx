"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";

export function PricingTopHomeLink() {
  const [hover, setHover] = useState(false);
  return (
    <nav style={topNavStyle} aria-label="Site">
      <Link
        href="/"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          ...backLinkStyle,
          color: hover ? "#dce4ff" : "rgba(142, 160, 208, 0.82)",
          textShadow: hover ? "0 0 18px rgba(200, 214, 255, 0.22)" : "none"
        }}
      >
        ← Back to Home
      </Link>
    </nav>
  );
}

export function PricingBottomHomeLink() {
  const [hover, setHover] = useState(false);
  return (
    <div style={bottomWrapStyle}>
      <Link
        href="/"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          ...returnHomeStyle,
          color: hover ? "#e8edff" : "#b4c3ec",
          borderColor: hover ? "rgba(160, 176, 230, 0.55)" : "rgba(136, 154, 212, 0.42)",
          background: hover ? "rgba(18, 28, 52, 0.95)" : "rgba(13, 21, 40, 0.9)",
          boxShadow: hover ? "0 8px 24px rgba(2, 4, 12, 0.35)" : "none"
        }}
      >
        Return Home
      </Link>
    </div>
  );
}

const topNavStyle: CSSProperties = {
  margin: "0 0 18px",
  padding: "0 2px"
};

const backLinkStyle: React.CSSProperties = {
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
  transition: "color 0.15s ease, text-shadow 0.15s ease"
};

const bottomWrapStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  marginTop: "44px",
  padding: "12px 0 8px"
};

const returnHomeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "44px",
  padding: "12px 24px",
  fontFamily: "inherit",
  fontSize: "0.94rem",
  fontWeight: 600,
  textDecoration: "none",
  border: "1px solid rgba(136, 154, 212, 0.42)",
  borderRadius: "11px",
  transition: "color 0.15s ease, border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease"
};
