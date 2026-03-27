"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { AudioCompare } from "@/components/audio-compare";
import { EmailCaptureForm } from "@/components/email-capture-form";
import { MasterReadyCallout } from "@/components/master-ready-callout";
import { GENRE_PRESETS, LOUDNESS_MODES, LoudnessMode } from "@/lib/genre-presets";
import type { MasterJobAnalysis } from "@/lib/api/master-analysis";
import { readResponsePayload } from "@/lib/http/read-response-payload";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";

type MasterResponse = {
  jobId: string;
  previews: {
    original: string;
    mastered: string;
  };
  download: {
    requiresEmail: true;
    fileId: string;
  };
  analysis: MasterJobAnalysis;
  quota?: {
    usedThisMonth: number;
    remainingFreeMasters: number;
    planId: string;
  };
};

export function UploadForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [genre, setGenre] = useState<keyof typeof GENRE_PRESETS>("pop");
  const [loudness, setLoudness] = useState<LoudnessMode>("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MasterResponse | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");

  const acceptedTypes = useMemo(() => [".wav", ".mp3"], []);

  function handleFileSelection(selected: File | null, input?: HTMLInputElement) {
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      setFile(null);
      setError(`File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.`);
      if (input) {
        input.value = "";
      }
      return;
    }
    setError(null);
    setFile(selected);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Please upload a WAV or MP3 file first.");
      return;
    }
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      setError(`File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.`);
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    setDownloadUrl(null);
    setStatus("Uploading file...");

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("genre", genre);
      formData.append("loudnessMode", loudness);

      const response = await fetch("/api/master", { method: "POST", body: formData });
      setStatus("Mastering and generating previews...");
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        const apiError = typeof payload?.error === "string" ? payload.error : null;
        throw new Error(apiError ?? "Mastering failed.");
      }
      if (!payload || !("jobId" in payload) || !("previews" in payload) || !("download" in payload) || !("analysis" in payload)) {
        throw new Error("Mastering response was empty or invalid.");
      }
      setResult(payload as MasterResponse);
      setStatus("Preview ready. Enter email to unlock final download.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setStatus("Something failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="master" style={panelStyle}>
      <div style={headingRowStyle}>
        <p style={eyebrowStyle}>Mastering Workspace</p>
        <p style={statusStyle}>{status}</p>
      </div>
      <h2 style={titleStyle}>Upload & Master Your Track</h2>
      <p style={textStyle}>Choose your settings and let our AI do the rest</p>

      <form onSubmit={handleSubmit} style={formStyle}>
        <div style={uploadZoneStyle}>
          <div style={uploadIconStyle}>⤴</div>
          <p style={uploadTitleStyle}>Drop your track here</p>
          <p style={uploadHintStyle}>or click to browse</p>
          <p style={uploadHintSubStyle}>Supports WAV, MP3 up to {MAX_UPLOAD_FILE_SIZE_LABEL}</p>
          <button type="button" style={browseButtonStyle} onClick={() => fileInputRef.current?.click()}>
            Browse Files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes.join(",")}
            onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null, event.currentTarget)}
            required
            style={inputStyle}
          />
          <p style={fileNameStyle}>{file ? `Selected: ${file.name}` : "No file selected yet"}</p>
        </div>

        <div style={controlBlockStyle}>
          <p style={groupLabelStyle}>Genre Preset</p>
          <div style={genreGridStyle}>
            {Object.entries(GENRE_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => setGenre(key as keyof typeof GENRE_PRESETS)}
                style={genre === key ? genreChipActiveStyle : genreChipStyle}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div style={controlBlockStyle}>
          <p style={groupLabelStyle}>Loudness Mode</p>
          <div style={loudnessGridStyle}>
            {Object.entries(LOUDNESS_MODES).map(([key, mode]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLoudness(key as LoudnessMode)}
                style={loudness === key ? loudnessCardActiveStyle : loudnessCardStyle}
              >
                <span style={loudnessTitleStyle}>{mode.label}</span>
                <span style={loudnessDescriptionStyle}>{mode.notes}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Mastering..." : "Master My Track"}
        </button>
      </form>

      {error ? <p style={errorStyle}>{error}</p> : null}

      {result ? (
        <div style={resultAreaStyle}>
          <MasterReadyCallout
            quotaLine={
              result.quota ? (
                <p style={{ margin: "14px 0 0", color: "#7dccb0", fontSize: "0.82rem" }}>
                  Free plan usage: {result.quota.usedThisMonth} used this month, {result.quota.remainingFreeMasters} remaining.
                </p>
              ) : null
            }
          />
          <AudioCompare originalPreviewUrl={result.previews.original} masteredPreviewUrl={result.previews.mastered} />
          {!downloadUrl ? (
            <EmailCaptureForm jobId={result.jobId} fileId={result.download.fileId} onUnlocked={setDownloadUrl} />
          ) : (
            <a href={downloadUrl} style={downloadStyle}>
              Download Final Master
            </a>
          )}
        </div>
      ) : null}
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  background:
    "radial-gradient(900px 280px at 90% -10%, rgba(120, 64, 255, 0.24), rgba(120, 64, 255, 0) 58%), linear-gradient(145deg, #11172a 0%, #0b1020 55%, #090d18 100%)",
  border: "1px solid rgba(139, 152, 209, 0.26)",
  borderRadius: "30px",
  boxShadow: "0 22px 55px rgba(2, 5, 15, 0.52), inset 0 1px 0 rgba(255,255,255,0.06)",
  padding: "clamp(20px, 3.2vw, 36px)"
};

const headingRowStyle: React.CSSProperties = { display: "grid", justifyItems: "center", gap: "8px" };
const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#b7c4ff",
  fontSize: "0.74rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.16em"
};
const titleStyle: React.CSSProperties = {
  margin: "8px auto 0",
  textAlign: "center",
  fontSize: "clamp(1.7rem, 3vw, 2.6rem)",
  color: "#f1f5ff",
  letterSpacing: "-0.01em",
  maxWidth: "760px",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};
const textStyle: React.CSSProperties = {
  color: "#aeb8dc",
  margin: "8px auto 0",
  marginBottom: 0,
  textAlign: "center",
  lineHeight: 1.65,
  maxWidth: "760px"
};
const statusStyle: React.CSSProperties = {
  color: "#8da1ce",
  marginTop: "2px",
  marginBottom: 0,
  fontSize: "0.83rem"
};

const formStyle: React.CSSProperties = { marginTop: "20px", display: "grid", gap: "14px" };
const uploadZoneStyle: React.CSSProperties = {
  borderRadius: "22px",
  border: "2px dashed rgba(133, 151, 220, 0.34)",
  background: "linear-gradient(165deg, rgba(19, 28, 52, 0.52), rgba(13, 20, 38, 0.52))",
  padding: "22px 16px 14px",
  textAlign: "center"
};
const uploadIconStyle: React.CSSProperties = {
  width: "68px",
  height: "68px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  margin: "0 auto 10px",
  color: "#fff",
  fontSize: "1.2rem",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  boxShadow: "0 12px 32px rgba(121, 100, 255, 0.44)"
};
const uploadTitleStyle: React.CSSProperties = { margin: 0, color: "#ecf1ff", fontWeight: 700, fontSize: "1.25rem" };
const uploadHintStyle: React.CSSProperties = { margin: "4px 0 0", color: "#9ba8d2", fontSize: "0.9rem" };
const uploadHintSubStyle: React.CSSProperties = { margin: "4px 0 0", color: "#8c99c2", fontSize: "0.8rem" };
const browseButtonStyle: React.CSSProperties = {
  marginTop: "12px",
  borderRadius: "10px",
  border: "1px solid rgba(81, 97, 148, 0.64)",
  background: "rgba(14, 22, 39, 0.9)",
  color: "#e3e8ff",
  padding: "10px 18px",
  fontWeight: 700
};

const inputStyle: React.CSSProperties = {
  position: "absolute",
  opacity: 0,
  pointerEvents: "none",
  width: 0,
  height: 0
};
const fileNameStyle: React.CSSProperties = { margin: "10px 0 0", color: "#b9c6f1", fontSize: "0.86rem" };

const controlBlockStyle: React.CSSProperties = {
  marginTop: "2px"
};
const groupLabelStyle: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#e1e8ff",
  fontWeight: 700
};
const genreGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))"
};
const genreChipStyle: React.CSSProperties = {
  borderRadius: "10px",
  border: "1px solid rgba(81, 97, 148, 0.48)",
  background: "rgba(14, 22, 39, 0.82)",
  color: "#e2e9ff",
  padding: "10px 8px",
  fontWeight: 700
};
const genreChipActiveStyle: React.CSSProperties = {
  ...genreChipStyle,
  border: "1px solid rgba(151, 116, 255, 0.8)",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  boxShadow: "0 10px 24px rgba(121, 100, 255, 0.34)"
};
const loudnessGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
};
const loudnessCardStyle: React.CSSProperties = {
  borderRadius: "14px",
  border: "1px solid rgba(81, 97, 148, 0.48)",
  background: "rgba(14, 22, 39, 0.82)",
  color: "#e2e9ff",
  padding: "12px",
  textAlign: "left",
  display: "grid",
  gap: "4px"
};
const loudnessCardActiveStyle: React.CSSProperties = {
  ...loudnessCardStyle,
  border: "1px solid rgba(151, 116, 255, 0.88)",
  boxShadow: "inset 0 0 0 1px rgba(151, 116, 255, 0.45), 0 10px 24px rgba(121, 100, 255, 0.24)"
};
const loudnessTitleStyle: React.CSSProperties = { fontWeight: 700 };
const loudnessDescriptionStyle: React.CSSProperties = { color: "#9aa8cf", fontSize: "0.87rem" };

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: "12px",
  background: "linear-gradient(125deg, #8b79ff 0%, #5e7dff 100%)",
  boxShadow: "0 10px 25px rgba(102, 121, 255, 0.34)",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: "1rem",
  padding: "15px 18px",
  cursor: "pointer"
};

const errorStyle: React.CSSProperties = {
  color: "#ff8ba8",
  marginTop: "12px"
};

const resultAreaStyle: React.CSSProperties = { marginTop: "20px", display: "grid", gap: "16px" };

const downloadStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "14px",
  background: "linear-gradient(120deg, #2de39d, #7ce5ff)",
  color: "#031b14",
  fontWeight: 700,
  textDecoration: "none",
  padding: "13px 18px"
};
