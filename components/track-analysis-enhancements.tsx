import type { CSSProperties, ReactNode } from "react";
import type { MasterJobAnalysis } from "@/lib/api/master-analysis";
import type { PublicTrackMetrics } from "@/lib/audio/public-analysis";
import { hasAnyMetric } from "@/lib/audio/public-analysis";

const EPS_LUFS = 0.06;
const EPS_DB = 0.06;
const EPS_SEC = 0.05;

/** Pre-master stats: prefer explicit `analysis.original`; if missing, top-level equals input-only responses. */
function resolvePreMasterMetrics(analysis: MasterJobAnalysis): PublicTrackMetrics {
  if (analysis.original && hasAnyMetric(analysis.original)) {
    return analysis.original;
  }
  return {
    durationSec: analysis.durationSec,
    integratedLufs: analysis.integratedLufs,
    peakDb: analysis.peakDb,
    crestDb: analysis.crestDb
  };
}

function formatMetricsOneLine(m: PublicTrackMetrics): string {
  return `Length: ${m.durationSec ?? "n/a"}s · LUFS: ${m.integratedLufs ?? "n/a"} · Peak: ${m.peakDb ?? "n/a"} dB · Crest: ${m.crestDb ?? "n/a"} dB`;
}

function lufsChangeLine(orig: number, next: number): { text: string; tone: "positive" | "neutral" | "soft" } {
  const diff = next - orig;
  if (Math.abs(diff) < EPS_LUFS) {
    return { text: "No change", tone: "soft" };
  }
  const louder = diff > 0;
  const mag = Math.abs(diff).toFixed(1);
  const sign = louder ? "+" : "-";
  return {
    text: `${sign}${mag} dB ${louder ? "louder" : "quieter"}`,
    tone: louder ? "positive" : "neutral"
  };
}

function peakChangeLine(orig: number, next: number): { text: string; tone: "positive" | "neutral" | "soft" } {
  const diff = next - orig;
  if (Math.abs(diff) < EPS_DB) {
    return { text: "No meaningful change", tone: "soft" };
  }
  const mag = Math.abs(diff).toFixed(1);
  if (diff > 0) {
    return { text: `+${mag} dB closer to target`, tone: "neutral" };
  }
  return { text: `-${mag} dB · more headroom`, tone: "soft" };
}

function crestChangeLine(orig: number, next: number): { text: string; tone: "positive" | "neutral" | "soft" } {
  const diff = next - orig;
  if (Math.abs(diff) < EPS_DB) {
    return { text: "No change", tone: "soft" };
  }
  const mag = Math.abs(diff).toFixed(1);
  if (diff < 0) {
    return { text: `${mag} dB reduced dynamic range`, tone: "neutral" };
  }
  return { text: `${mag} dB wider dynamics`, tone: "neutral" };
}

function lengthChangeLine(orig: number, next: number): { text: string; tone: "positive" | "neutral" | "soft" } {
  const diff = next - orig;
  if (Math.abs(diff) < EPS_SEC) {
    return { text: "No change", tone: "soft" };
  }
  const sign = diff > 0 ? "+" : "-";
  const mag = Math.abs(diff).toFixed(2);
  return {
    text: `${sign}${mag}s`,
    tone: "neutral"
  };
}

type MetricRow = {
  label: string;
  original: string;
  enhanced: string;
  change: { text: string; tone: "positive" | "neutral" | "soft" };
};

function buildRows(original: PublicTrackMetrics, mastered: PublicTrackMetrics): MetricRow[] {
  const rows: MetricRow[] = [];

  if (original.integratedLufs !== null && mastered.integratedLufs !== null) {
    const o = original.integratedLufs;
    const m = mastered.integratedLufs;
    rows.push({
      label: "LUFS",
      original: `${o.toFixed(1)} LUFS`,
      enhanced: `${m.toFixed(1)} LUFS`,
      change: lufsChangeLine(o, m)
    });
  }

  if (original.peakDb !== null && mastered.peakDb !== null) {
    const o = original.peakDb;
    const m = mastered.peakDb;
    rows.push({
      label: "Peak",
      original: `${o.toFixed(1)} dB`,
      enhanced: `${m.toFixed(1)} dB`,
      change: peakChangeLine(o, m)
    });
  }

  if (original.crestDb !== null && mastered.crestDb !== null) {
    const o = original.crestDb;
    const m = mastered.crestDb;
    rows.push({
      label: "Crest",
      original: `${o.toFixed(1)} dB`,
      enhanced: `${m.toFixed(1)} dB`,
      change: crestChangeLine(o, m)
    });
  }

  if (original.durationSec !== null && mastered.durationSec !== null) {
    const o = original.durationSec;
    const m = mastered.durationSec;
    rows.push({
      label: "Length",
      original: `${o.toFixed(2)}s`,
      enhanced: `${m.toFixed(2)}s`,
      change: lengthChangeLine(o, m)
    });
  }

  return rows;
}

function changeColor(tone: "positive" | "neutral" | "soft"): string {
  if (tone === "positive") return "#7fe9c5";
  if (tone === "soft") return "#7a87ad";
  return "#a8b8ec";
}

function FallbackAnalysisCard({
  quotaLine,
  notesBlock,
  metricsLine,
  contextLabel
}: {
  metricsLine: string;
  contextLabel: string;
  quotaLine?: ReactNode;
  notesBlock: ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <p style={titleStyle}>Track analysis</p>
      <p style={simpleMutedStyle}>{contextLabel}</p>
      <p style={simpleBodyStyle}>{metricsLine}</p>
      {quotaLine}
      {notesBlock}
    </div>
  );
}

export function TrackAnalysisEnhancements({
  analysis,
  quotaLine
}: {
  analysis: MasterJobAnalysis;
  quotaLine?: ReactNode;
}) {
  const original = analysis.original;
  const mastered = analysis.mastered;
  const hasMastered = Boolean(mastered && hasAnyMetric(mastered));
  const hasOriginal = Boolean(original && hasAnyMetric(original));
  const canCompare = hasOriginal && hasMastered;

  const notesBlock =
    analysis.notes.length > 0 ? (
      <ul style={{ margin: "12px 0 0", paddingLeft: "18px", color: "#afbadf", lineHeight: 1.55 }}>
        {analysis.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    ) : null;

  const preMaster = resolvePreMasterMetrics(analysis);
  const preMasterLine = formatMetricsOneLine(preMaster);
  const fallbackContextLabel =
    hasMastered && !hasOriginal ? "Available measurements" : "Upload file (pre-master)";

  if (!canCompare || !original || !mastered) {
    return (
      <div style={unavailableWrapStyle}>
        {!hasMastered ? <p style={unavailableMessageStyle}>Enhanced comparison unavailable for this file.</p> : null}
        <FallbackAnalysisCard
          contextLabel={fallbackContextLabel}
          metricsLine={preMasterLine}
          quotaLine={quotaLine}
          notesBlock={notesBlock}
        />
      </div>
    );
  }

  const rows = buildRows(original, mastered);

  if (rows.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={titleStyle}>Track analysis enhancements</p>
        <p style={subtitleStyle}>See what changed after mastering</p>
        <p style={helperLineStyle}>Enhanced values reflect the mastered output.</p>
        <p style={simpleMutedStyle}>Side-by-side metrics couldn’t be paired. Pre-master vs master summary:</p>
        <p style={simpleBodyStyle}>Upload (pre-master): {formatMetricsOneLine(original)}</p>
        <p style={simpleBodyStyle}>Mastered output: {formatMetricsOneLine(mastered)}</p>
        {quotaLine}
        {notesBlock}
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <p style={titleStyle}>Track analysis enhancements</p>
      <p style={subtitleStyle}>See what changed after mastering</p>
      <p style={helperLineStyle}>Enhanced values reflect the mastered output.</p>
      <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
        {rows.map((row) => (
          <div key={row.label} style={metricCardStyle}>
            <p style={metricLabelStyle}>{row.label}</p>
            <div style={valuesGridStyle}>
              <div>
                <span style={dimLabelStyle}>Original</span>
                <p style={originalValueStyle}>{row.original}</p>
              </div>
              <div>
                <span style={dimLabelStyle}>Enhanced</span>
                <p style={enhancedValueStyle}>{row.enhanced}</p>
              </div>
            </div>
            <p style={{ ...changeStyle, color: changeColor(row.change.tone) }}>
              <span style={changeKeyStyle}>Change</span> {row.change.text}
            </p>
          </div>
        ))}
      </div>
      {quotaLine}
      {notesBlock}
    </div>
  );
}

const unavailableWrapStyle: CSSProperties = {
  display: "grid",
  gap: "12px"
};

const unavailableMessageStyle: CSSProperties = {
  margin: 0,
  color: "#6d7ca8",
  fontSize: "0.82rem",
  lineHeight: 1.5
};

const cardStyle: CSSProperties = {
  background: "linear-gradient(160deg, rgba(21, 29, 54, 0.72), rgba(12, 17, 34, 0.72))",
  border: "1px solid rgba(134, 147, 204, 0.30)",
  borderRadius: "16px",
  padding: "18px"
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#eef2ff",
  fontWeight: 700,
  fontSize: "1.05rem"
};

const subtitleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#8da1ce",
  fontSize: "0.82rem",
  fontWeight: 500
};

const helperLineStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#6d7ca8",
  fontSize: "0.78rem",
  lineHeight: 1.45
};

const simpleMutedStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#8da1ce",
  fontSize: "0.82rem"
};

const simpleBodyStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#d6ddf8",
  lineHeight: 1.65,
  fontSize: "0.92rem"
};

const metricCardStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(93, 108, 160, 0.28)",
  background: "rgba(8, 12, 26, 0.45)",
  padding: "12px 14px",
  display: "grid",
  gap: "8px"
};

const metricLabelStyle: CSSProperties = {
  margin: 0,
  color: "#c8d2f8",
  fontWeight: 700,
  fontSize: "0.78rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase"
};

const valuesGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px"
};

const dimLabelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.68rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#6d7aad",
  marginBottom: "4px",
  fontWeight: 600
};

const originalValueStyle: CSSProperties = {
  margin: 0,
  color: "#9aa7cc",
  fontSize: "0.95rem",
  fontVariantNumeric: "tabular-nums"
};

const enhancedValueStyle: CSSProperties = {
  margin: 0,
  color: "#eef3ff",
  fontSize: "0.98rem",
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums"
};

const changeStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.86rem",
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums"
};

const changeKeyStyle: CSSProperties = {
  fontWeight: 700,
  color: "#6d7aad",
  marginRight: "6px",
  fontSize: "0.72rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase"
};
