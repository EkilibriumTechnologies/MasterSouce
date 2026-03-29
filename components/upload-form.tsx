"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

/** Session-only; used only when set via owner testing panel (`?owner=1`). Never logged. */
const MASTER_ADMIN_BYPASS_STORAGE_KEY = "master_admin_bypass_token";
import { AudioCompare } from "@/components/audio-compare";
import { EmailCaptureForm } from "@/components/email-capture-form";
import { MasterReadyCallout } from "@/components/master-ready-callout";
import { GENRE_PRESETS, LOUDNESS_MODES, LoudnessMode } from "@/lib/genre-presets";
import type { MasterJobAnalysis } from "@/lib/api/master-analysis";
import { readResponsePayload } from "@/lib/http/read-response-payload";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";

/** Same resolution as `handleSubmit` — single source of truth for `x-master-admin-bypass`. */
function resolveBypassTokenForMasterSubmit(ownerTestingPanel: boolean, ownerBypassDraft: string): string {
  if (typeof window === "undefined") return "";
  const bypass =
    ownerTestingPanel && ownerBypassDraft.trim()
      ? ownerBypassDraft.trim()
      : sessionStorage.getItem(MASTER_ADMIN_BYPASS_STORAGE_KEY)?.trim() ?? "";
  return bypass;
}

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
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [ownerTestingPanel, setOwnerTestingPanel] = useState(false);
  const [ownerBypassDraft, setOwnerBypassDraft] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("owner") !== "1") return;
    setOwnerTestingPanel(true);
    const existing = sessionStorage.getItem(MASTER_ADMIN_BYPASS_STORAGE_KEY);
    setOwnerBypassDraft(existing ?? "");
  }, []);

  const ownerOverrideArmed = useMemo(() => {
    if (!ownerTestingPanel) return false;
    if (ownerBypassDraft.trim().length > 0) return true;
    if (typeof window === "undefined") return false;
    return Boolean(sessionStorage.getItem(MASTER_ADMIN_BYPASS_STORAGE_KEY)?.trim());
  }, [ownerTestingPanel, ownerBypassDraft]);

  const acceptedTypes = useMemo(() => [".wav", ".mp3"], []);

  const FREE_PLAN_COMPLETE_STATUS = "Free plan complete";
  const FREE_PLAN_COMPLETE_ERROR = "Your free masters are complete. Upgrade to continue mastering tracks.";

  function isLikelyNetworkError(err: unknown): boolean {
    if (err instanceof DOMException && err.name === "AbortError") return true;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "Failed to fetch" || msg === "Load failed" || msg === "NetworkError when attempting to fetch resource.") {
      return true;
    }
    if (err instanceof TypeError && /failed to fetch|network|load failed/i.test(msg)) return true;
    return false;
  }

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
    setUpgradeModalOpen(false);
    setLoading(true);
    setResult(null);
    setDownloadUrl(null);
    setStatus("Uploading file...");

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("genre", genre);
      formData.append("loudnessMode", loudness);

      const headers: Record<string, string> = {};
      const bypass = resolveBypassTokenForMasterSubmit(ownerTestingPanel, ownerBypassDraft);
      if (bypass) headers["x-master-admin-bypass"] = bypass;

      const response = await fetch("/api/master", { method: "POST", body: formData, headers });

      // Quota / payment-required: handle before reading body so empty 402 bodies never hit parsing or !ok throws.
      if (response.status === 402) {
        setStatus(FREE_PLAN_COMPLETE_STATUS);
        setError(FREE_PLAN_COMPLETE_ERROR);
        setUpgradeModalOpen(true);
        return;
      }

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
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      if (isLikelyNetworkError(err)) {
        setError(
          isLocalhost
            ? "Could not reach the server. If you are on localhost, keep npm run dev running and try again. If the dev server restarts while mastering, wait until it is Ready and submit again."
            : "Could not reach the server. Please try again in a moment. If it keeps failing, refresh and retry."
        );
      } else {
        const raw = err instanceof Error ? err.message : "Unexpected error.";
        setError(raw);
      }
      setStatus("Something failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function applyOwnerBypassFromDraft() {
    const trimmed = ownerBypassDraft.trim();
    if (trimmed) {
      sessionStorage.setItem(MASTER_ADMIN_BYPASS_STORAGE_KEY, trimmed);
    } else {
      sessionStorage.removeItem(MASTER_ADMIN_BYPASS_STORAGE_KEY);
    }
  }

  function clearOwnerBypass() {
    sessionStorage.removeItem(MASTER_ADMIN_BYPASS_STORAGE_KEY);
    setOwnerBypassDraft("");
  }

  return (
    <section id="master" style={panelStyle}>
      {ownerTestingPanel ? (
        <div style={ownerTestingPanelStyle}>
          <p style={ownerTestingTitleStyle}>Local owner testing only</p>
          <p style={ownerTestingHintStyle}>
            Stored only in this browser session. Not sent to analytics. Paste a bypass token to add the{" "}
            <code style={ownerTestingCodeStyle}>x-master-admin-bypass</code> header on POST{" "}
            <code style={ownerTestingCodeStyle}>/api/master</code>.
          </p>
          <label htmlFor="owner-bypass-token" style={ownerTestingLabelStyle}>
            Token (hidden field)
          </label>
          <input
            id="owner-bypass-token"
            type="password"
            autoComplete="off"
            value={ownerBypassDraft}
            onChange={(e) => setOwnerBypassDraft(e.target.value)}
            placeholder="Paste token"
            style={ownerTestingInputStyle}
          />
          <p style={ownerTestingTokenHelperStyle}>The typed token will be used immediately on submit.</p>
          <div style={ownerTestingActionsStyle}>
            <button type="button" style={ownerTestingPrimaryStyle} onClick={applyOwnerBypassFromDraft}>
              Save to session
            </button>
            <button type="button" style={ownerTestingSecondaryStyle} onClick={clearOwnerBypass}>
              Remove
            </button>
          </div>
          <div
            style={ownerOverrideArmed ? ownerOverrideStatusArmedStyle : ownerOverrideStatusUnarmedStyle}
            role="status"
            aria-live="polite"
          >
            {ownerOverrideArmed
              ? "Override armed — bypass header will be sent"
              : "Override not armed"}
          </div>
          <p style={ownerTestingDebugLineStyle}>Submit path active: yes</p>
          <p style={ownerTestingDebugLineStyle}>
            Bypass header attached on next submit:{" "}
            {resolveBypassTokenForMasterSubmit(ownerTestingPanel, ownerBypassDraft) ? "yes" : "no"}
          </p>
        </div>
      ) : null}
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

      {error ? (
        <p style={error === FREE_PLAN_COMPLETE_ERROR ? quotaExhaustedMessageStyle : errorStyle}>{error}</p>
      ) : null}

      {upgradeModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-dialog-title"
          style={upgradeModalBackdropStyle}
        >
          <div style={upgradeModalPanelStyle}>
            <p id="upgrade-dialog-title" style={upgradeModalTitleStyle}>
              Free plan complete
            </p>
            <p style={upgradeModalBodyStyle}>{FREE_PLAN_COMPLETE_ERROR}</p>
            <div style={upgradeModalActionsStyle}>
              <a href="#pricing" style={upgradeModalPrimaryStyle} onClick={() => setUpgradeModalOpen(false)}>
                View pricing
              </a>
              <button type="button" style={upgradeModalSecondaryStyle} onClick={() => setUpgradeModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div style={resultAreaStyle}>
          <MasterReadyCallout
            quotaLine={
              result.quota ? (
                <p
                  style={{
                    margin: "14px 0 0",
                    color: result.quota.remainingFreeMasters > 0 ? "#7dccb0" : "#a8c4bb",
                    fontSize: "0.82rem",
                    lineHeight: 1.55
                  }}
                >
                  {result.quota.remainingFreeMasters > 0 ? (
                    <>
                      Free plan usage: {result.quota.usedThisMonth} used, {result.quota.remainingFreeMasters} remaining
                    </>
                  ) : (
                    <>{FREE_PLAN_COMPLETE_ERROR}</>
                  )}
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

const ownerTestingPanelStyle: React.CSSProperties = {
  marginBottom: "16px",
  padding: "12px 14px",
  borderRadius: "14px",
  border: "1px dashed rgba(200, 160, 90, 0.45)",
  background: "rgba(28, 22, 12, 0.55)"
};
const ownerTestingTitleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  color: "#f0d9a8",
  fontSize: "0.78rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em"
};
const ownerTestingHintStyle: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#b8a88c",
  fontSize: "0.78rem",
  lineHeight: 1.5
};
const ownerTestingCodeStyle: React.CSSProperties = {
  fontSize: "0.76rem",
  color: "#d4c4a4"
};
const ownerTestingLabelStyle: React.CSSProperties = {
  display: "block",
  margin: "0 0 4px",
  color: "#9a8c70",
  fontSize: "0.72rem"
};
const ownerTestingInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "8px",
  border: "1px solid rgba(140, 120, 80, 0.5)",
  background: "rgba(10, 12, 18, 0.85)",
  color: "#e8e0d0",
  padding: "8px 10px",
  fontSize: "0.82rem"
};
const ownerTestingActionsStyle: React.CSSProperties = {
  marginTop: "8px",
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  alignItems: "center"
};
const ownerTestingPrimaryStyle: React.CSSProperties = {
  borderRadius: "8px",
  border: "1px solid rgba(200, 160, 90, 0.5)",
  background: "rgba(60, 48, 24, 0.9)",
  color: "#f5e6c8",
  padding: "6px 12px",
  fontSize: "0.78rem",
  fontWeight: 600,
  cursor: "pointer"
};
const ownerTestingSecondaryStyle: React.CSSProperties = {
  borderRadius: "8px",
  border: "1px solid rgba(120, 100, 70, 0.45)",
  background: "transparent",
  color: "#a89878",
  padding: "6px 12px",
  fontSize: "0.78rem",
  cursor: "pointer"
};
const ownerTestingTokenHelperStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#8a7b62",
  fontSize: "0.68rem",
  lineHeight: 1.45
};
const ownerTestingDebugLineStyle: React.CSSProperties = {
  margin: "10px 0 0",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid rgba(160, 140, 100, 0.35)",
  background: "rgba(12, 14, 20, 0.75)",
  color: "#c4b896",
  fontSize: "0.72rem",
  fontFamily: "ui-monospace, monospace",
  lineHeight: 1.55
};
const ownerOverrideStatusArmedStyle: React.CSSProperties = {
  margin: "10px 0 0",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid rgba(90, 180, 120, 0.45)",
  background: "rgba(18, 42, 28, 0.65)",
  color: "#7dccb0",
  fontSize: "0.76rem",
  fontWeight: 700,
  lineHeight: 1.45
};
const ownerOverrideStatusUnarmedStyle: React.CSSProperties = {
  margin: "10px 0 0",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid rgba(140, 80, 80, 0.35)",
  background: "rgba(28, 18, 18, 0.45)",
  color: "#9a7a7a",
  fontSize: "0.76rem",
  fontWeight: 600,
  lineHeight: 1.45
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

/** Shown for HTTP 402 quota exhaustion — calm, not “error red”. */
const quotaExhaustedMessageStyle: React.CSSProperties = {
  color: "#a8c4bb",
  marginTop: "12px",
  lineHeight: 1.55,
  fontSize: "0.95rem"
};

const upgradeModalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "grid",
  placeItems: "center",
  padding: "20px",
  background: "rgba(4, 8, 18, 0.72)",
  backdropFilter: "blur(6px)"
};

const upgradeModalPanelStyle: React.CSSProperties = {
  width: "min(420px, 100%)",
  borderRadius: "18px",
  border: "1px solid rgba(120, 200, 170, 0.28)",
  background: "linear-gradient(160deg, rgba(16, 28, 40, 0.96), rgba(10, 14, 26, 0.98))",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
  padding: "22px 22px 18px"
};

const upgradeModalTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#e8fff4",
  fontWeight: 700,
  fontSize: "1.05rem",
  letterSpacing: "-0.02em"
};

const upgradeModalBodyStyle: React.CSSProperties = {
  margin: "12px 0 0",
  color: "#9fb8ae",
  fontSize: "0.9rem",
  lineHeight: 1.55
};

const upgradeModalActionsStyle: React.CSSProperties = {
  marginTop: "18px",
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  alignItems: "center"
};

const upgradeModalPrimaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  padding: "10px 16px",
  fontWeight: 700,
  fontSize: "0.88rem",
  textDecoration: "none",
  color: "#061a14",
  background: "linear-gradient(120deg, #2de39d, #5cdbb8)"
};

const upgradeModalSecondaryStyle: React.CSSProperties = {
  borderRadius: "10px",
  border: "1px solid rgba(120, 140, 180, 0.45)",
  background: "transparent",
  color: "#c6d4e8",
  padding: "9px 14px",
  fontSize: "0.85rem",
  cursor: "pointer"
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
