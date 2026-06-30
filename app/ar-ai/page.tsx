"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import type { ArAiReport } from "@/lib/ar-ai/types";

const RELEASE_INTENT_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "single", label: "Single release" },
  { value: "playlist_pitch", label: "Playlist pitch" },
  { value: "tiktok_reels", label: "TikTok / Reels" },
  { value: "youtube", label: "YouTube" },
  { value: "radio", label: "Radio" },
  { value: "demo_feedback", label: "Demo feedback" }
] as const;

type FormState = {
  intendedGenre: string;
  targetAudience: string;
  lyrics: string;
  references: string;
  releaseIntent: string;
};

const defaultFormState: FormState = {
  intendedGenre: "",
  targetAudience: "",
  lyrics: "",
  references: "",
  releaseIntent: ""
};

function ratingColor(score: number): string {
  if (score >= 80) return "#8de8cb";
  if (score >= 70) return "#9eb6ff";
  if (score >= 60) return "#f0c674";
  return "#f5a097";
}

export default function ArAiPage() {
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ArAiReport | null>(null);

  const canSubmit = useMemo(() => Boolean(audioFile) && !isSubmitting, [audioFile, isSubmitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!audioFile) {
      setError("Please upload an audio file (WAV or MP3).");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setReport(null);

    const payload = new FormData();
    payload.append("audio", audioFile);
    payload.append("intendedGenre", form.intendedGenre.trim());
    if (form.targetAudience.trim()) payload.append("targetAudience", form.targetAudience.trim());
    if (form.lyrics.trim()) payload.append("lyrics", form.lyrics.trim());
    if (form.references.trim()) payload.append("references", form.references.trim());
    if (form.releaseIntent) payload.append("releaseIntent", form.releaseIntent);

    try {
      const response = await fetch("/api/ar-ai", {
        method: "POST",
        body: payload
      });

      const data = (await response.json()) as ArAiReport & { error?: string; message?: string };

      if (!response.ok) {
        setError(data.message || data.error || "A&R evaluation failed. Please try again.");
        return;
      }

      setReport(data);
    } catch {
      setError("Network error while submitting your track. Please check your connection and retry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main style={mainStyle}>
      <nav style={topNavStyle} aria-label="Site">
        <Link href="/" style={backLinkStyle}>
          ← Back to MasterSauce
        </Link>
      </nav>

      <header style={heroStyle}>
        <p style={eyebrowStyle}>Release readiness</p>
        <h1 style={h1Style}>MasterSauce A&R AI</h1>
        <p style={introStyle}>
          Get a professional A&R-style release readiness report for your song. This does not predict hits — it evaluates
          how competitive your track appears within its intended genre.
        </p>
      </header>

      <form style={cardStyle} onSubmit={handleSubmit} aria-labelledby="ar-ai-form-heading">
        <h2 id="ar-ai-form-heading" style={h2Style}>
          Submit your track
        </h2>

        <label style={labelStyle}>
          Audio file (WAV or MP3) *
          <input
            type="file"
            accept=".wav,.mp3,audio/wav,audio/mpeg,audio/mp3"
            required
            style={fileInputStyle}
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setAudioFile(next);
            }}
          />
        </label>

        <label style={labelStyle}>
          Intended genre *
          <input
            type="text"
            value={form.intendedGenre}
            onChange={(event) => setForm((prev) => ({ ...prev, intendedGenre: event.target.value }))}
            placeholder="e.g. melodic house, alt-pop, drill"
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Target audience (optional)
          <input
            type="text"
            value={form.targetAudience}
            onChange={(event) => setForm((prev) => ({ ...prev, targetAudience: event.target.value }))}
            placeholder="e.g. festival mainstage listeners, Gen Z playlist curators"
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Release intent (optional)
          <select
            value={form.releaseIntent}
            onChange={(event) => setForm((prev) => ({ ...prev, releaseIntent: event.target.value }))}
            style={inputStyle}
          >
            {RELEASE_INTENT_OPTIONS.map((option) => (
              <option key={option.value || "none"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Reference artists or songs (optional)
          <input
            type="text"
            value={form.references}
            onChange={(event) => setForm((prev) => ({ ...prev, references: event.target.value }))}
            placeholder="e.g. Fred again.., Kaytranada — not for copying, for market context"
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Lyrics (optional)
          <textarea
            value={form.lyrics}
            onChange={(event) => setForm((prev) => ({ ...prev, lyrics: event.target.value }))}
            placeholder="Paste lyrics for deeper songwriting analysis"
            rows={6}
            style={textareaStyle}
          />
        </label>

        <button type="submit" disabled={!canSubmit} style={canSubmit ? submitButtonStyle : submitButtonDisabledStyle}>
          {isSubmitting ? "Analyzing track…" : "Generate A&R Report"}
        </button>

        {error ? (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        ) : null}

        {isSubmitting ? (
          <p style={loadingStyle} aria-live="polite">
            Running production metrics and A&R evaluation. This may take up to a minute.
          </p>
        ) : null}
      </form>

      {report ? <ArAiReportView report={report} /> : null}
    </main>
  );
}

function ArAiReportView({ report }: { report: ArAiReport }) {
  return (
    <section style={reportSectionStyle} aria-labelledby="ar-ai-report-heading">
      <h2 id="ar-ai-report-heading" style={h2Style}>
        Song A&R Report
      </h2>

      <div style={overallRatingCardStyle}>
        <p style={overallLabelStyle}>Overall A&R Rating</p>
        <p style={{ ...overallScoreStyle, color: ratingColor(report.overallRating.score) }}>
          {report.overallRating.score}
          <span style={overallScoreSuffixStyle}>/100</span>
        </p>
        <p style={overallMeaningStyle}>{report.overallRating.meaning}</p>
        <p style={mutedParagraphStyle}>{report.overallRating.why}</p>
      </div>

      <ReportBlock title="Executive Summary" body={report.summary} />
      <ReportBlock title="Audio / Production Analysis" body={report.audioAnalysis} />
      <ReportBlock title="Songwriting Analysis" body={report.songwritingAnalysis} />
      <ReportBlock title="Commercial Analysis" body={report.commercialAnalysis} />

      {report.technicalMetrics ? (
        <div style={subCardStyle}>
          <h3 style={h3Style}>Technical audio metrics</h3>
          <div style={metricsGridStyle}>
            {[
              ["Duration", report.technicalMetrics.durationSec != null ? `${report.technicalMetrics.durationSec}s` : "—"],
              ["Integrated LUFS", report.technicalMetrics.integratedLufs ?? "—"],
              ["Peak (dB)", report.technicalMetrics.peakDb ?? "—"],
              ["Crest / dynamics (dB)", report.technicalMetrics.crestDb ?? "—"],
              ["Low-end energy (dB)", report.technicalMetrics.lowEndDb ?? "—"],
              ["Low-mid (dB)", report.technicalMetrics.lowMidDb ?? "—"],
              ["Presence/harshness (dB)", report.technicalMetrics.harshnessDb ?? "—"],
              ["Air band (dB)", report.technicalMetrics.airDb ?? "—"]
            ].map(([label, value]) => (
              <div key={label} style={metricRowStyle}>
                <span style={metricKeyStyle}>{label}</span>
                <span style={metricValueStyle}>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={subCardStyle}>
        <h3 style={h3Style}>A&R Scorecard</h3>
        <div style={scorecardGridStyle}>
          {report.scorecard.map((entry) => (
            <article key={entry.category} style={scorecardItemStyle}>
              <div style={scorecardHeaderStyle}>
                <strong style={scorecardCategoryStyle}>{entry.category}</strong>
                <span style={{ ...scorecardScoreStyle, color: ratingColor(entry.score) }}>{entry.score}</span>
              </div>
              <p style={scorecardWhyStyle}>{entry.why}</p>
            </article>
          ))}
        </div>
      </div>

      <RankedList title="Top 10 Strengths" items={report.strengths} />
      <RankedList title="Top 10 Weaknesses" items={report.weaknesses} />

      <div style={subCardStyle}>
        <h3 style={h3Style}>Top 10 Highest Impact Improvements</h3>
        <ol style={improvementListStyle}>
          {report.improvements.map((item) => (
            <li key={item.rank} style={improvementItemStyle}>
              <p style={improvementTitleStyle}>
                #{item.rank} — {item.title}
              </p>
              <p style={mutedParagraphStyle}>
                <strong>Why it matters:</strong> {item.whyItMatters}
              </p>
              <p style={mutedParagraphStyle}>
                <strong>How to improve:</strong> {item.howToImprove}
              </p>
              <p style={impactRowStyle}>
                <span style={impactBadgeStyle}>{item.impactLevel}</span>
                <span style={impactEstimateStyle}>Est. rating lift: {item.estimatedRatingIncrease}</span>
              </p>
            </li>
          ))}
        </ol>
      </div>

      <ReportBlock title="Label A&R Discussion Points" body={report.labelDiscussionPoints} />

      <p style={disclaimerStyle}>{report.disclaimer}</p>
    </section>
  );
}

function ReportBlock({ title, body }: { title: string; body: string }) {
  return (
    <div style={subCardStyle}>
      <h3 style={h3Style}>{title}</h3>
      <p style={analysisParagraphStyle}>{body}</p>
    </div>
  );
}

function RankedList({ title, items }: { title: string; items: ArAiReport["strengths"] }) {
  return (
    <div style={subCardStyle}>
      <h3 style={h3Style}>{title}</h3>
      <ol style={rankedListStyle}>
        {items.map((item) => (
          <li key={item.rank} style={rankedItemStyle}>
            <strong>
              #{item.rank} — {item.title}
            </strong>
            <p style={mutedParagraphStyle}>{item.explanation}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const mainStyle: CSSProperties = {
  maxWidth: "860px",
  margin: "0 auto",
  padding: "28px clamp(20px, 4vw, 36px) 88px",
  color: "#eef2ff",
  fontFamily: "inherit",
  boxSizing: "border-box"
};

const topNavStyle: CSSProperties = {
  margin: "0 0 28px",
  padding: "0 2px"
};

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "44px",
  padding: "8px 10px 8px 4px",
  color: "#9eb6ff",
  textDecoration: "none",
  fontWeight: 600
};

const heroStyle: CSSProperties = {
  marginBottom: "24px"
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 8px",
  color: "#8de8cb",
  fontSize: "0.82rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase"
};

const h1Style: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "clamp(1.8rem, 4vw, 2.4rem)",
  lineHeight: 1.15,
  letterSpacing: "-0.02em"
};

const introStyle: CSSProperties = {
  margin: 0,
  color: "#b8c4ea",
  maxWidth: "62ch",
  fontSize: "1.02rem"
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  padding: "20px",
  borderRadius: "16px",
  border: "1px solid rgba(118, 136, 210, 0.35)",
  background: "linear-gradient(155deg, rgba(18, 26, 48, 0.95), rgba(10, 16, 32, 0.88))",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)"
};

const h2Style: CSSProperties = {
  margin: 0,
  fontSize: "1.15rem",
  color: "#f0f4ff"
};

const h3Style: CSSProperties = {
  margin: "0 0 10px",
  fontSize: "1rem",
  color: "#e8edff"
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#c9d4f5",
  fontSize: "0.88rem",
  fontWeight: 600
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(86, 104, 160, 0.55)",
  background: "rgba(8, 14, 28, 0.85)",
  color: "#eef2ff",
  font: "inherit"
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: "120px"
};

const fileInputStyle: CSSProperties = {
  ...inputStyle,
  padding: "8px"
};

const submitButtonStyle: CSSProperties = {
  marginTop: "4px",
  padding: "12px 16px",
  borderRadius: "12px",
  border: "1px solid rgba(141, 232, 203, 0.45)",
  background: "linear-gradient(135deg, rgba(36, 88, 78, 0.95), rgba(18, 52, 46, 0.95))",
  color: "#eafff8",
  fontWeight: 700,
  cursor: "pointer"
};

const submitButtonDisabledStyle: CSSProperties = {
  ...submitButtonStyle,
  opacity: 0.55,
  cursor: "not-allowed"
};

const errorStyle: CSSProperties = {
  margin: 0,
  color: "#ffb4ab",
  fontWeight: 600
};

const loadingStyle: CSSProperties = {
  margin: 0,
  color: "#9eb6ff",
  fontSize: "0.92rem"
};

const reportSectionStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  marginTop: "28px"
};

const overallRatingCardStyle: CSSProperties = {
  padding: "20px",
  borderRadius: "16px",
  border: "1px solid rgba(154, 132, 255, 0.45)",
  background: "linear-gradient(160deg, rgba(32, 26, 58, 0.95), rgba(14, 20, 42, 0.95))",
  textAlign: "center"
};

const overallLabelStyle: CSSProperties = {
  margin: "0 0 6px",
  color: "#c9d4f5",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  fontSize: "0.78rem"
};

const overallScoreStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "3rem",
  fontWeight: 800,
  lineHeight: 1
};

const overallScoreSuffixStyle: CSSProperties = {
  fontSize: "1.2rem",
  fontWeight: 600,
  color: "#9eb6ff",
  marginLeft: "4px"
};

const overallMeaningStyle: CSSProperties = {
  margin: "0 0 8px",
  color: "#f0f4ff",
  fontWeight: 700
};

const subCardStyle: CSSProperties = {
  ...cardStyle,
  margin: 0
};

const analysisParagraphStyle: CSSProperties = {
  margin: 0,
  color: "#d6def8",
  whiteSpace: "pre-wrap",
  lineHeight: 1.55
};

const mutedParagraphStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#b8c4ea",
  lineHeight: 1.5
};

const scorecardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "10px"
};

const scorecardItemStyle: CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  border: "1px solid rgba(86, 104, 160, 0.45)",
  background: "rgba(8, 14, 28, 0.72)"
};

const scorecardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "8px",
  marginBottom: "6px"
};

const scorecardCategoryStyle: CSSProperties = {
  color: "#eef2ff",
  fontSize: "0.9rem"
};

const scorecardScoreStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: "1.1rem"
};

const scorecardWhyStyle: CSSProperties = {
  margin: 0,
  color: "#b8c4ea",
  fontSize: "0.86rem",
  lineHeight: 1.45
};

const rankedListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.1rem",
  display: "grid",
  gap: "10px"
};

const rankedItemStyle: CSSProperties = {
  color: "#eef2ff"
};

const improvementListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.1rem",
  display: "grid",
  gap: "14px"
};

const improvementItemStyle: CSSProperties = {
  color: "#eef2ff"
};

const improvementTitleStyle: CSSProperties = {
  margin: "0 0 4px",
  fontWeight: 700
};

const impactRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  alignItems: "center",
  marginTop: "8px"
};

const impactBadgeStyle: CSSProperties = {
  fontSize: "0.74rem",
  fontWeight: 700,
  color: "#8de8cb",
  border: "1px solid rgba(141, 232, 203, 0.35)",
  borderRadius: "999px",
  padding: "4px 10px",
  background: "rgba(12, 32, 28, 0.55)"
};

const impactEstimateStyle: CSSProperties = {
  fontSize: "0.82rem",
  color: "#9eb6ff"
};

const metricsGridStyle: CSSProperties = {
  display: "grid",
  gap: "6px"
};

const metricRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  padding: "6px 0",
  borderBottom: "1px solid rgba(86, 104, 160, 0.25)"
};

const metricKeyStyle: CSSProperties = {
  color: "#9eb6ff",
  fontSize: "0.86rem"
};

const metricValueStyle: CSSProperties = {
  color: "#eef2ff",
  fontWeight: 600,
  fontSize: "0.86rem"
};

const disclaimerStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#9aa8cf",
  fontSize: "0.86rem",
  fontStyle: "italic"
};
