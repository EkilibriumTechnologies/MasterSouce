"use client";

import type { CSSProperties } from "react";
import {
  canShowMasteringDecisionReport,
  type MasteringDecisionMeasurements,
  type MasteringDecisionReport
} from "@/lib/audio/mastering-decision-report";

type MasteringDecisionReportPanelProps = {
  adaptiveResultExists: boolean;
  report: MasteringDecisionReport | null | undefined;
};

function formatLufs(value: number): string {
  return `${value.toFixed(1)} LUFS`;
}

function formatPeak(value: number): string {
  return `${value.toFixed(1)} dB`;
}

function formatCrest(value: number): string {
  return `${value.toFixed(1)} dB`;
}

function MeasurementList({ measurements }: { measurements: MasteringDecisionMeasurements }) {
  const rows: Array<{ label: string; value: string }> = [];
  if (measurements.integratedLufs !== undefined) {
    rows.push({ label: "Integrated LUFS", value: formatLufs(measurements.integratedLufs) });
  }
  if (measurements.peakDb !== undefined) {
    rows.push({ label: "Peak", value: formatPeak(measurements.peakDb) });
  }
  if (measurements.crestDb !== undefined) {
    rows.push({ label: "Crest", value: formatCrest(measurements.crestDb) });
  }
  if (!rows.length) {
    return <p style={emptyMetricStyle}>No measurements available.</p>;
  }
  return (
    <dl style={metricListStyle}>
      {rows.map((row) => (
        <div key={row.label} style={metricRowStyle}>
          <dt style={metricLabelStyle}>{row.label}</dt>
          <dd style={metricValueStyle}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MasteringDecisionReportPanel({
  adaptiveResultExists,
  report
}: MasteringDecisionReportPanelProps) {
  if (!canShowMasteringDecisionReport(adaptiveResultExists, report) || !report) {
    return null;
  }

  const hasPre = Object.keys(report.preMeasurements).length > 0;
  const hasPost = Object.keys(report.postMeasurements).length > 0;
  const hasTarget = report.selectedTargetLufs !== null;
  const showTechnical = hasPre || hasPost || hasTarget;

  return (
    <section
      aria-labelledby="mastering-decision-report-heading"
      data-testid="mastering-decision-report"
      style={cardStyle}
    >
      <h3 id="mastering-decision-report-heading" style={headingStyle}>
        What MasterSauce Changed
      </h3>
      <p style={summaryStyle}>{report.summary}</p>
      {report.decisions.length ? (
        <ul style={decisionListStyle}>
          {report.decisions.map((decision) => (
            <li key={`${decision.category}-${decision.action}-${decision.title}`} style={decisionItemStyle}>
              <p style={decisionTitleStyle}>{decision.title}</p>
              <p style={decisionBodyStyle}>{decision.explanation}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {report.warnings.length ? (
        <ul style={warningListStyle}>
          {report.warnings.map((warning) => (
            <li key={warning} style={warningItemStyle}>
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
      {showTechnical ? (
        <details style={detailsStyle}>
          <summary style={summaryToggleStyle}>Technical Details</summary>
          <div style={technicalGridStyle}>
            {hasPre ? (
              <div>
                <p style={technicalHeadingStyle}>Before</p>
                <MeasurementList measurements={report.preMeasurements} />
              </div>
            ) : null}
            {hasPost ? (
              <div>
                <p style={technicalHeadingStyle}>After</p>
                <MeasurementList measurements={report.postMeasurements} />
              </div>
            ) : null}
            {hasTarget ? (
              <p style={targetStyle}>Selected loudness target: {formatLufs(report.selectedTargetLufs!)}</p>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "min(100%, 560px)",
  boxSizing: "border-box",
  borderRadius: "16px",
  border: "1px solid rgba(108, 124, 188, 0.28)",
  background:
    "linear-gradient(165deg, rgba(22, 28, 48, 0.55) 0%, rgba(14, 18, 34, 0.72) 55%, rgba(10, 14, 26, 0.82) 100%)",
  boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.18) inset, 0 12px 32px rgba(4, 8, 22, 0.28)",
  padding: "clamp(16px, 3.5vw, 20px) clamp(18px, 3.5vw, 22px)",
  textAlign: "left",
  display: "grid",
  gap: "12px"
};

const headingStyle: CSSProperties = {
  margin: 0,
  color: "#eef2ff",
  fontWeight: 700,
  fontSize: "clamp(1rem, 2.4vw, 1.12rem)",
  letterSpacing: "-0.02em",
  lineHeight: 1.35
};

const summaryStyle: CSSProperties = {
  margin: 0,
  color: "rgba(178, 190, 228, 0.92)",
  fontSize: "0.86rem",
  lineHeight: 1.55
};

const decisionListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: "10px"
};

const decisionItemStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(92, 111, 174, 0.35)",
  background: "rgba(10, 16, 30, 0.72)",
  padding: "10px 12px",
  display: "grid",
  gap: "4px"
};

const decisionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#d8e4ff",
  fontSize: "0.92rem",
  fontWeight: 700
};

const decisionBodyStyle: CSSProperties = {
  margin: 0,
  color: "#a7b4db",
  fontSize: "0.82rem",
  lineHeight: 1.5
};

const warningListStyle: CSSProperties = {
  margin: 0,
  padding: "0 0 0 18px",
  color: "#f0d28a",
  fontSize: "0.8rem",
  lineHeight: 1.5
};

const warningItemStyle: CSSProperties = {
  margin: "0 0 4px"
};

const detailsStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(92, 111, 174, 0.28)",
  background: "rgba(8, 12, 24, 0.55)",
  padding: "10px 12px"
};

const summaryToggleStyle: CSSProperties = {
  cursor: "pointer",
  color: "#9db2ef",
  fontSize: "0.8rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase"
};

const technicalGridStyle: CSSProperties = {
  marginTop: "10px",
  display: "grid",
  gap: "12px"
};

const technicalHeadingStyle: CSSProperties = {
  margin: "0 0 6px",
  color: "#c4d1f5",
  fontSize: "0.8rem",
  fontWeight: 700
};

const metricListStyle: CSSProperties = {
  margin: 0,
  display: "grid",
  gap: "4px"
};

const metricRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px"
};

const metricLabelStyle: CSSProperties = {
  margin: 0,
  color: "#97a8da",
  fontSize: "0.78rem"
};

const metricValueStyle: CSSProperties = {
  margin: 0,
  color: "#e7eeff",
  fontSize: "0.78rem",
  fontWeight: 700
};

const emptyMetricStyle: CSSProperties = {
  margin: 0,
  color: "#97a8da",
  fontSize: "0.78rem"
};

const targetStyle: CSSProperties = {
  margin: 0,
  color: "#b9c7ef",
  fontSize: "0.78rem"
};
