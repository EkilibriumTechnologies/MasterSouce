"use client";

import { useEffect, useState } from "react";

import { getFathersDayPromoRemainingMs, isFathersDayPromoActive } from "@/lib/promo/fathers-day-2026";

type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function getCountdownParts(remainingMs: number): CountdownParts {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

type PromoCountdownTimerProps = {
  compact?: boolean;
  onExpired?: () => void;
};

export function PromoCountdownTimer({ compact = false, onExpired }: PromoCountdownTimerProps) {
  const [remainingMs, setRemainingMs] = useState(() => getFathersDayPromoRemainingMs());
  const active = isFathersDayPromoActive();

  useEffect(() => {
    if (!active) {
      onExpired?.();
      return;
    }
    const tick = () => {
      const next = getFathersDayPromoRemainingMs();
      setRemainingMs(next);
      if (next <= 0) onExpired?.();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active, onExpired]);

  if (!active || remainingMs <= 0) return null;

  const parts = getCountdownParts(remainingMs);

  return (
    <div style={compact ? compactWrapStyle : wrapStyle} aria-label="Promotion ends in">
      {(
        [
          ["Days", parts.days],
          ["Hours", parts.hours],
          ["Minutes", parts.minutes],
          ["Seconds", parts.seconds]
        ] as const
      ).map(([label, value]) => (
        <div key={label} style={compact ? compactUnitStyle : unitStyle}>
          <span style={compact ? compactValueStyle : valueStyle}>{String(value).padStart(2, "0")}</span>
          <span style={compact ? compactLabelStyle : labelStyle}>{label}</span>
        </div>
      ))}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(56px, 1fr))",
  gap: "10px",
  marginTop: "14px"
};

const compactWrapStyle: React.CSSProperties = {
  ...wrapStyle,
  gridTemplateColumns: "repeat(4, minmax(48px, 1fr))",
  gap: "8px",
  marginTop: "12px"
};

const unitStyle: React.CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(151, 116, 255, 0.42)",
  background: "rgba(18, 24, 44, 0.82)",
  padding: "10px 8px",
  textAlign: "center"
};

const compactUnitStyle: React.CSSProperties = {
  ...unitStyle,
  padding: "8px 6px",
  borderRadius: "10px"
};

const valueStyle: React.CSSProperties = {
  display: "block",
  color: "#f3ecff",
  fontWeight: 800,
  fontSize: "1.35rem",
  lineHeight: 1.1,
  fontVariantNumeric: "tabular-nums"
};

const compactValueStyle: React.CSSProperties = {
  ...valueStyle,
  fontSize: "1.1rem"
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginTop: "4px",
  color: "#a8b4e8",
  fontSize: "0.68rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em"
};

const compactLabelStyle: React.CSSProperties = {
  ...labelStyle,
  fontSize: "0.62rem"
};
