"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { HomeProductMetrics } from "@/lib/product-metrics";

const METRICS_LABELS = {
  downloads: "Final masters exported",
  previews: "A/B previews before committing",
  prompts: "Song Architect blueprints generated"
};

type HeroStatsBarProps = {
  metrics: HomeProductMetrics;
  className?: string;
};

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.max(0, Math.floor(n)));
}

function computeStartValue(target: number): number {
  if (target <= 0) return 0;
  const delta = Math.max(6, Math.min(48, Math.round(target * 0.028)));
  return Math.max(0, target - delta);
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function HeroStatsBar({ metrics, className }: HeroStatsBarProps) {
  const targets = useMemo(
    () => ({
      downloads: metrics.downloads,
      previews: metrics.previews,
      prompts: metrics.prompts
    }),
    [metrics.downloads, metrics.previews, metrics.prompts]
  );

  const [narrow, setNarrow] = useState(false);
  const [display, setDisplay] = useState(() => ({
    downloads: targets.downloads,
    previews: targets.previews,
    prompts: targets.prompts
  }));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setDisplay(targets);
      return;
    }

    const starts = {
      downloads: computeStartValue(targets.downloads),
      previews: computeStartValue(targets.previews),
      prompts: computeStartValue(targets.prompts)
    };
    setDisplay(starts);

    const durationMs = 820;
    const t0 = performance.now();
    let raf = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = easeOutCubic(t);
      setDisplay({
        downloads: Math.round(starts.downloads + (targets.downloads - starts.downloads) * eased),
        previews: Math.round(starts.previews + (targets.previews - starts.previews) * eased),
        prompts: Math.round(starts.prompts + (targets.prompts - starts.prompts) * eased)
      });
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(targets);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [targets]);

  const columns: Array<{ key: keyof HomeProductMetrics; label: string }> = [
    { key: "downloads", label: METRICS_LABELS.downloads },
    { key: "previews", label: METRICS_LABELS.previews },
    { key: "prompts", label: METRICS_LABELS.prompts }
  ];

  const wrapStyle: CSSProperties = {
    marginTop: "22px",
    display: narrow ? "flex" : "grid",
    flexDirection: narrow ? "column" : undefined,
    gridTemplateColumns: narrow ? undefined : "repeat(3, minmax(0, 1fr))",
    gap: 0,
    width: "100%",
    maxWidth: "720px",
    marginLeft: "auto",
    marginRight: "auto",
    padding: narrow ? "16px 14px" : "14px 12px",
    borderRadius: "18px",
    border: "1px solid rgba(74, 90, 150, 0.28)",
    background: "linear-gradient(155deg, rgba(16, 24, 46, 0.55), rgba(10, 16, 32, 0.45))",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)"
  };

  return (
    <div style={wrapStyle} className={className} aria-label="Product usage highlights">
      {columns.map((col, index) => {
        const cellPad: CSSProperties = narrow
          ? { padding: "12px 6px", minWidth: 0, textAlign: "center" as const }
          : { padding: "6px 10px", minWidth: 0, textAlign: "center" as const };
        const divider: CSSProperties | undefined = narrow
          ? index < columns.length - 1
            ? { borderBottom: "1px solid rgba(86, 102, 156, 0.28)" }
            : undefined
          : index < columns.length - 1
            ? { borderRight: "1px solid rgba(86, 102, 156, 0.28)" }
            : undefined;
        return (
          <div key={col.key} style={{ ...cellPad, ...divider }}>
            <p style={metricStyle}>
              {formatCount(display[col.key])}
              <span style={plusStyle}>+</span>
            </p>
            <p style={labelStyle}>{col.label}</p>
          </div>
        );
      })}
    </div>
  );
}

const metricStyle: CSSProperties = {
  margin: 0,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  fontSize: "clamp(1.35rem, 3.2vw, 1.75rem)",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: "#eef1ff",
  lineHeight: 1.15
};

const plusStyle: CSSProperties = {
  fontWeight: 700,
  marginLeft: "1px",
  color: "rgba(196, 208, 255, 0.72)",
  fontSize: "0.92em"
};

const labelStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "0.78rem",
  color: "rgba(148, 162, 206, 0.95)",
  lineHeight: 1.45,
  fontWeight: 500
};
