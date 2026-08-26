"use client";

import { useRef, useState } from "react";
import { MASTERSOUCE_BILLING_EMAIL_HEADER } from "@/lib/billing/client-key";
import type { PublicGenerationMatchResult } from "@/lib/song-architect/generation-match-public";
import type { SongDNA } from "@/lib/song-architect/types";

type GenerationMatchPanelProps = {
  songDNA: SongDNA;
  stylePrompt: string;
  sunoBlueprint?: string;
  getBillingEmail: () => string;
  onEmailVerificationRequired?: () => void;
};

type ApiResponse =
  | {
      ok: true;
      match: PublicGenerationMatchResult;
      improvedGenerationPrompt: string | null;
    }
  | {
      ok?: false;
      code?: string;
      message?: string;
      error?: string;
    };

const ACCEPTED_EXT = new Set(["wav", "mp3"]);

function overallLabel(overall: PublicGenerationMatchResult["overall"]): string {
  if (overall === "high") return "Close match";
  if (overall === "medium") return "Partial match";
  if (overall === "low") return "Far from the intended design";
  return "Not enough measurable evidence";
}

function statusLabel(status: string): string {
  if (status === "matched") return "Matched";
  if (status === "partial") return "Partial";
  if (status === "missed") return "Deviated";
  return "Not evaluated";
}

function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }
  return Promise.reject(new Error("Clipboard is unavailable."));
}

export function GenerationMatchPanel({
  songDNA,
  stylePrompt,
  sunoBlueprint,
  getBillingEmail,
  onEmailVerificationRequired
}: GenerationMatchPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [match, setMatch] = useState<PublicGenerationMatchResult | null>(null);
  const [improvedPrompt, setImprovedPrompt] = useState<string | null>(null);
  const [showImprovedPrompt, setShowImprovedPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setError("");
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    if (!file) {
      setError("Upload the generated WAV or MP3 first.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXT.has(ext) && !/audio\/(mpeg|mp3|wav|x-wav|wave)/i.test(file.type)) {
      setError("Only WAV or MP3 files are supported.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setCopied(false);

    const songDNASnapshot = JSON.stringify(songDNA);

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("songDNA", songDNASnapshot);
      formData.append("stylePrompt", stylePrompt);
      if (sunoBlueprint) formData.append("sunoBlueprint", sunoBlueprint);

      const headers: Record<string, string> = {};
      const billingEmail = getBillingEmail();
      if (billingEmail) {
        headers[MASTERSOUCE_BILLING_EMAIL_HEADER] = billingEmail;
        formData.append("billingEmail", billingEmail);
      }

      const response = await fetch("/api/song-architect/generation-match", {
        method: "POST",
        headers,
        body: formData
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || data.ok !== true) {
        const code = "code" in data ? data.code : undefined;
        if (code === "email_verification_required") {
          onEmailVerificationRequired?.();
        }
        setMatch(null);
        setImprovedPrompt(null);
        setShowImprovedPrompt(false);
        setError(
          ("message" in data && typeof data.message === "string" && data.message) ||
            ("error" in data && typeof data.error === "string" && data.error) ||
            "Generation Match could not be completed."
        );
        return;
      }

      setMatch(data.match);
      setImprovedPrompt(data.improvedGenerationPrompt);
      setShowImprovedPrompt(false);
    } catch {
      setMatch(null);
      setImprovedPrompt(null);
      setError("Could not check Generation Match right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyImprovedPrompt() {
    if (!improvedPrompt) return;
    try {
      await copyText(improvedPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy the improved generation prompt.");
    }
  }

  const matchedDimensions = match?.dimensions.filter((dimension) => dimension.status === "matched") ?? [];
  const divergedDimensions =
    match?.dimensions.filter((dimension) => dimension.status === "partial" || dimension.status === "missed") ?? [];
  const skippedDimensions = match?.dimensions.filter((dimension) => dimension.status === "not_evaluable") ?? [];

  return (
    <section style={cardStyle} aria-label="Generation Match">
      <div style={headerStyle}>
        <p style={headingStyle}>Generation Match</p>
      </div>
      <p style={bodyStyle}>
        After you generate this song in Suno, Udio, or another tool, upload that audio to see how closely it matches
        the intended Song DNA. This is a design-match check, not a prediction of commercial success.
      </p>

      <label style={fileLabelStyle}>
        Generated track (WAV or MP3)
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3,audio/wav,audio/mpeg"
          onChange={handleFileChange}
          disabled={isSubmitting}
          style={fileInputStyle}
        />
      </label>
      {file ? <p style={fileNameStyle}>{file.name}</p> : null}

      <button type="button" style={primaryButtonStyle} onClick={() => void handleSubmit()} disabled={isSubmitting}>
        {isSubmitting ? "Checking match..." : "Check Generation Match"}
      </button>

      {error ? <p style={errorStyle}>{error}</p> : null}

      {match ? (
        <div style={resultStackStyle}>
          <p style={overallStyle}>
            {overallLabel(match.overall)}
            {match.evidenceCounts.measured + match.evidenceCounts.inferred > 0
              ? ` · ${match.evidenceCounts.measured} measured, ${match.evidenceCounts.inferred} inferred`
              : ""}
          </p>
          <p style={disclaimerStyle}>
            Scores describe closeness to this Song Architect design. They do not say whether the song is commercially
            good or likely to succeed.
          </p>

          {matchedDimensions.length > 0 ? (
            <div>
              <p style={sectionHeadingStyle}>A. Matched the intended design</p>
              <ul style={listStyle}>
                {matchedDimensions.map((dimension) => (
                  <li key={dimension.id}>
                    <strong>{dimension.label}</strong>
                    {dimension.intended !== undefined ? ` — intended ${String(dimension.intended)}` : ""}
                    {dimension.observed !== undefined ? `; heard ${String(dimension.observed)}` : ""}.{" "}
                    {dimension.explanation}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p style={mutedStyle}>No measured dimensions matched the intended design.</p>
          )}

          {divergedDimensions.length > 0 ? (
            <div>
              <p style={sectionHeadingStyle}>B. Deviated from the intended design</p>
              <ul style={listStyle}>
                {divergedDimensions.map((dimension) => (
                  <li key={dimension.id}>
                    <strong>
                      {dimension.label} ({statusLabel(dimension.status)})
                    </strong>
                    {dimension.intended !== undefined ? ` — intended ${String(dimension.intended)}` : ""}
                    {dimension.observed !== undefined ? `; heard ${String(dimension.observed)}` : ""}.{" "}
                    {dimension.explanation}
                  </li>
                ))}
              </ul>
            </div>
          ) : match.overall !== "not_evaluable" ? (
            <p style={mutedStyle}>No meaningful divergences were measured.</p>
          ) : null}

          {match.correctionDirections.length > 0 ? (
            <div>
              <p style={sectionHeadingStyle}>C. Suggestions for the next generation</p>
              <ul style={listStyle}>
                {match.correctionDirections.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {skippedDimensions.length > 0 ? (
            <details style={detailsStyle}>
              <summary style={summaryStyle}>Dimensions not evaluated</summary>
              <ul style={listStyle}>
                {skippedDimensions.map((dimension) => (
                  <li key={dimension.id}>
                    <strong>{dimension.label}:</strong> {dimension.explanation}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {improvedPrompt ? (
            <div>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => setShowImprovedPrompt((current) => !current)}
              >
                Improve Generation Prompt
              </button>
              {showImprovedPrompt ? (
                <>
                  <p style={mutedStyle}>
                    This derived prompt keeps the original Song DNA unchanged. Copy it into Suno or Udio for the next
                    generation.
                  </p>
                  <button type="button" style={copyButtonStyle} onClick={() => void handleCopyImprovedPrompt()}>
                    {copied ? "Copied ✓" : "Copy Improved Prompt"}
                  </button>
                  <pre style={promptStyle}>{improvedPrompt}</pre>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(141, 232, 203, 0.28)",
  borderRadius: "12px",
  padding: "10px",
  background: "linear-gradient(160deg, rgba(16, 36, 32, 0.92), rgba(14, 20, 38, 0.88))"
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px"
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  color: "#8de8cb",
  fontWeight: 700,
  fontSize: "0.8rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em"
};

const bodyStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#c5d4ef",
  fontSize: "0.84rem",
  lineHeight: 1.5
};

const fileLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
  marginTop: "12px",
  color: "#d7e2ff",
  fontSize: "0.8rem",
  fontWeight: 600
};

const fileInputStyle: React.CSSProperties = {
  color: "#c9d7ff",
  fontSize: "0.78rem"
};

const fileNameStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#9ed5c3",
  fontSize: "0.78rem"
};

const primaryButtonStyle: React.CSSProperties = {
  marginTop: "12px",
  border: "none",
  cursor: "pointer",
  borderRadius: "999px",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  boxShadow: "0 12px 30px rgba(121, 100, 255, 0.28)",
  color: "#fff",
  fontWeight: 700,
  padding: "10px 16px"
};

const secondaryButtonStyle: React.CSSProperties = {
  marginTop: "4px",
  border: "1px solid rgba(141, 232, 203, 0.4)",
  cursor: "pointer",
  borderRadius: "999px",
  background: "rgba(12, 32, 28, 0.7)",
  color: "#8de8cb",
  fontWeight: 700,
  fontSize: "0.8rem",
  padding: "8px 14px"
};

const copyButtonStyle: React.CSSProperties = {
  marginTop: "8px",
  border: "1px solid rgba(110, 127, 183, 0.45)",
  borderRadius: "999px",
  background: "rgba(17, 24, 43, 0.76)",
  color: "#c9d7ff",
  fontWeight: 600,
  fontSize: "0.76rem",
  padding: "6px 10px",
  cursor: "pointer"
};

const errorStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#ffbac8",
  fontWeight: 600,
  fontSize: "0.84rem"
};

const resultStackStyle: React.CSSProperties = {
  marginTop: "14px",
  display: "grid",
  gap: "10px"
};

const overallStyle: React.CSSProperties = {
  margin: 0,
  color: "#f0f5ff",
  fontWeight: 700,
  fontSize: "0.95rem"
};

const disclaimerStyle: React.CSSProperties = {
  margin: 0,
  color: "#95a4d2",
  fontSize: "0.76rem",
  lineHeight: 1.45
};

const sectionHeadingStyle: React.CSSProperties = {
  margin: "0 0 4px",
  color: "#cedbff",
  fontWeight: 700,
  fontSize: "0.78rem",
  letterSpacing: "0.03em"
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: "18px",
  color: "#c5d4ef",
  fontSize: "0.82rem",
  lineHeight: 1.5
};

const mutedStyle: React.CSSProperties = {
  margin: 0,
  color: "#95a4d2",
  fontSize: "0.8rem",
  lineHeight: 1.45
};

const detailsStyle: React.CSSProperties = {
  color: "#aebce5",
  fontSize: "0.8rem"
};

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  color: "#cedbff",
  fontWeight: 600
};

const promptStyle: React.CSSProperties = {
  marginTop: "8px",
  whiteSpace: "pre-wrap",
  color: "#d7e2ff",
  fontSize: "0.78rem",
  lineHeight: 1.45,
  background: "rgba(8, 14, 28, 0.72)",
  borderRadius: "8px",
  padding: "8px"
};
