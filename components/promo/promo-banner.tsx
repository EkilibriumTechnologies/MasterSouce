"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { trackEvent } from "@/lib/analytics/ab-comparison";
import { FATHERS_DAY_PROMO_CODE, isFathersDayPromoActive } from "@/lib/promo/fathers-day-2026";

type PromoBannerProps = {
  href?: string;
  onNavigate?: () => void;
};

export function PromoBanner({ href = "/pricing", onNavigate }: PromoBannerProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isFathersDayPromoActive());
  }, []);

  if (!active) return null;

  function handleClick() {
    trackEvent("promo_banner_click", {
      source_component: "fathers_day_promo_banner",
      page_path: typeof window !== "undefined" ? window.location.pathname : undefined
    });
    onNavigate?.();
  }

  const content = (
    <>
      <span style={emojiStyle} aria-hidden="true">
        🎉
      </span>
      <span style={textStyle}>
        <strong style={strongStyle}>Father&apos;s Day Weekend:</strong> 50% off all paid plans with code{" "}
        <span style={codeStyle}>{FATHERS_DAY_PROMO_CODE}</span> — ends Jun 22 at 11:59 PM.
      </span>
    </>
  );

  if (href.startsWith("#")) {
    return (
      <a href={href} style={bannerStyle} onClick={handleClick}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} style={bannerStyle} onClick={handleClick}>
      {content}
    </Link>
  );
}

const bannerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "10px",
  marginTop: "14px",
  marginBottom: "4px",
  border: "1px solid rgba(255, 160, 90, 0.45)",
  borderRadius: "14px",
  padding: "12px 14px",
  background: "linear-gradient(135deg, rgba(58, 32, 18, 0.72), rgba(34, 24, 52, 0.78))",
  color: "#f6e8dc",
  textDecoration: "none",
  lineHeight: 1.45,
  fontSize: "0.92rem",
  cursor: "pointer",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease"
};

const emojiStyle: React.CSSProperties = {
  fontSize: "1.1rem",
  lineHeight: 1.2,
  flexShrink: 0
};

const textStyle: React.CSSProperties = {
  color: "#f0e2d6"
};

const strongStyle: React.CSSProperties = {
  color: "#ffd8b8",
  fontWeight: 700
};

const codeStyle: React.CSSProperties = {
  color: "#ffe4a8",
  fontWeight: 800,
  letterSpacing: "0.03em"
};
