"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

/** Session-only; used only when set via owner testing panel (`?owner=1`). Never logged. */
const MASTER_ADMIN_BYPASS_STORAGE_KEY = "master_admin_bypass_token";
import { AudioCompare } from "@/components/audio-compare";
import { DownloadLimitModal } from "@/components/download-limit-modal";
import { EmailCaptureForm } from "@/components/email-capture-form";
import { MasterReadyCallout } from "@/components/master-ready-callout";
import type { MasterAiResponse } from "@/lib/api/adaptive-master";
import { GENRE_PRESETS, LOUDNESS_MODES, LoudnessMode } from "@/lib/genre-presets";
import type { MasterJobAnalysis } from "@/lib/api/master-analysis";
import { readResponsePayload } from "@/lib/http/read-response-payload";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";

/** Owner panel: session token for owner bypass checks on GET /api/download. */
function resolveOwnerSessionToken(ownerTestingPanel: boolean): string {
  if (typeof window === "undefined") return "";
  if (!ownerTestingPanel) return "";
  return sessionStorage.getItem(MASTER_ADMIN_BYPASS_STORAGE_KEY)?.trim() ?? "";
}

function readFilenameFromContentDisposition(header: string | null): string {
  if (!header) return "mastered.wav";
  const utf8Match = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]).replace(/[\\/:*?"<>|]/g, "_");
  const quotedMatch = header.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1].replace(/[\\/:*?"<>|]/g, "_");
  return "mastered.wav";
}

async function downloadFinalMasterWithOptionalBypass(downloadUrl: string, ownerToken: string): Promise<void> {
  const trimmedToken = ownerToken.trim();
  const headers: Record<string, string> = {};
  if (trimmedToken) {
    headers["x-master-admin-bypass"] = "1";
    headers["x-master-owner-token"] = trimmedToken;
  }
  const res = await fetch(downloadUrl, { credentials: "include", headers });
  if (res.status === 403) {
    let errorCode: string | null = null;
    let message = "No masters remaining. Upgrade or get 5 more for $4.";
    try {
      const j = (await res.json()) as { error?: string; message?: string };
      if (typeof j.error === "string") errorCode = j.error;
      if (typeof j.message === "string") message = j.message;
    } catch {
      /* ignore parse errors */
    }
    if (errorCode === "no_masters_remaining") {
      message = "No masters remaining. Upgrade or get 5 more for $4.";
      const limitError = new Error(message);
      limitError.name = "DownloadLimitExceededError";
      throw limitError;
    }
    throw new Error(message);
  }
  if (!res.ok) {
    throw new Error("Download failed. Please try again.");
  }
  const filename = readFilenameFromContentDisposition(res.headers.get("content-disposition"));
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function debugAdaptive(message: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  if (meta) {
    console.log(`[ADAPTIVE_DEBUG] ${message}`, meta);
    return;
  }
  console.log(`[ADAPTIVE_DEBUG] ${message}`);
}

function buildAdaptiveUpgradeUrl(): string {
  if (typeof window === "undefined") {
    return "/pricing?intent=adaptive&returnTo=%2F%3Fintent%3Dadaptive%23master";
  }
  const returnTarget = new URL(window.location.href);
  returnTarget.searchParams.set("intent", "adaptive");
  returnTarget.searchParams.delete("checkout");
  returnTarget.searchParams.delete("kind");
  returnTarget.searchParams.delete("upgraded");
  returnTarget.hash = "master";
  const returnTo = `${returnTarget.pathname}${returnTarget.search}${returnTarget.hash ? `#${returnTarget.hash.replace(/^#/, "")}` : ""}`;
  return `/pricing?intent=adaptive&returnTo=${encodeURIComponent(returnTo)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
    mastersUsedThisPeriod: number;
    monthlyMastersLimit: number;
    remainingMonthlyMasters: number;
    creditPackBalance: number;
    remainingMasters: number;
    planId: string;
  };
};

type AdaptiveAccessResponse = {
  entitled: boolean;
  planId: string;
  upgradeUrl: string | null;
};

type PreMasterAnalysisResponse = {
  analysis: {
    verdict: "Streaming-ready" | "Almost ready" | "Not fully streaming-ready";
    loudness: {
      valueLufs: number | null;
      status: string;
    };
    peakSafety: {
      valueDb: number | null;
      status: string;
    };
    dynamicControl: {
      valueDb: number | null;
      status: string;
    };
    recommendation: string;
  };
  debug?: {
    filename?: string;
    fileSize?: number;
    rawMetrics?: {
      integratedLufs?: number | null;
      peakDb?: number | null;
      crestDb?: number | null;
    };
  };
};

export function UploadForm() {
  const isProduction = process.env.NODE_ENV === "production";
  const preMasterAnalysisEnabled = true;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [genre, setGenre] = useState<keyof typeof GENRE_PRESETS>("pop");
  const [loudness, setLoudness] = useState<LoudnessMode>("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MasterResponse | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [preMasterAnalysis, setPreMasterAnalysis] = useState<PreMasterAnalysisResponse["analysis"] | null>(null);
  const [preMasterDebug, setPreMasterDebug] = useState<PreMasterAnalysisResponse["debug"] | null>(null);
  const [showAdaptivePlaceholder, setShowAdaptivePlaceholder] = useState(false);
  const [adaptiveEntitled, setAdaptiveEntitled] = useState(false);
  const [adaptiveUnlocked, setAdaptiveUnlocked] = useState(false);
  const [adaptiveIntent, setAdaptiveIntent] = useState("");
  const [adaptiveProcessing, setAdaptiveProcessing] = useState(false);
  const [adaptiveUpgradeUrl, setAdaptiveUpgradeUrl] = useState<string | null>(null);
  const [adaptiveModeActive, setAdaptiveModeActive] = useState(false);
  const [resumeAdaptiveAfterUpgrade, setResumeAdaptiveAfterUpgrade] = useState(false);
  const [lastStandardResult, setLastStandardResult] = useState<MasterResponse | null>(null);
  const [confirmedContinueWithStandard, setConfirmedContinueWithStandard] = useState(false);
  const [ownerTestingPanel, setOwnerTestingPanel] = useState(false);
  const [ownerBypassDraft, setOwnerBypassDraft] = useState("");
  const [ownerSessionToken, setOwnerSessionToken] = useState("");
  const [downloadLimitModalOpen, setDownloadLimitModalOpen] = useState(false);
  const latestAnalysisRequestIdRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("owner") !== "1") return;
    setOwnerTestingPanel(true);
    const existing = sessionStorage.getItem(MASTER_ADMIN_BYPASS_STORAGE_KEY)?.trim() ?? "";
    setOwnerBypassDraft(existing);
    setOwnerSessionToken(existing);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const adaptiveIntentParam = params.get("intent") === "adaptive";
    const upgraded = params.get("upgraded") === "1";
    const checkoutSuccess = params.get("checkout") === "success";
    const postUpgradeReturn = upgraded || (checkoutSuccess && adaptiveIntentParam);
    if (!adaptiveIntentParam && !upgraded) return;
    let disposed = false;
    setResumeAdaptiveAfterUpgrade(true);
    void (async () => {
      const maxAttempts = postUpgradeReturn ? 5 : 1;
      const retryDelayMs = 1200;
      const initialMessage = postUpgradeReturn
        ? "Finishing your upgrade... verifying Adaptive entitlement."
        : upgraded
          ? "Checking Adaptive entitlement after upgrade..."
          : "Checking Adaptive entitlement...";
      setStatus(initialMessage);

      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const access = await checkAdaptiveAccess();
          if (disposed) return;
          if (access.entitled) {
            setAdaptiveEntitled(true);
            setAdaptiveUnlocked(true);
            setAdaptiveUpgradeUrl(null);
            if (preMasterAnalysis) {
              setShowAdaptivePlaceholder(true);
              setStatus("Adaptive unlocked. Add optional direction and run it.");
            } else {
              setStatus("Adaptive unlocked. Analyze your track and continue with Adaptive.");
            }
            return;
          }

          if (attempt < maxAttempts) {
            setStatus("Finishing your upgrade...");
            await delay(retryDelayMs);
            if (disposed) return;
          }
        }

        const upgradeUrl = buildAdaptiveUpgradeUrl();
        setAdaptiveEntitled(false);
        setAdaptiveUnlocked(false);
        setAdaptiveUpgradeUrl(upgradeUrl);
        setStatus("Adaptive requires premium unlock before processing.");
      } catch (err: unknown) {
        if (disposed) return;
        const message = err instanceof Error ? err.message : "Unable to verify adaptive access.";
        setError(message);
        setStatus("Could not verify adaptive access.");
      }
    })();

    return () => {
      disposed = true;
    };
  }, [preMasterAnalysis]);

  const ownerOverrideArmed = useMemo(() => {
    if (!ownerTestingPanel) return false;
    return ownerSessionToken.length > 0;
  }, [ownerSessionToken, ownerTestingPanel]);

  const acceptedTypes = useMemo(() => [".wav", ".mp3"], []);

  const DOWNLOAD_LIMIT_MESSAGE =
    "No masters remaining. Upgrade or get 5 more for $4.";

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
    latestAnalysisRequestIdRef.current += 1;
    setPreMasterAnalysis(null);
    setPreMasterDebug(null);
    setShowAdaptivePlaceholder(false);
    setAdaptiveUnlocked(false);
    setAdaptiveIntent("");
    setAdaptiveUpgradeUrl(null);
    setAdaptiveModeActive(false);
    setLastStandardResult(null);
    setConfirmedContinueWithStandard(false);
    setResult(null);
    setDownloadUrl(null);
    setStatus("Ready");
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

  async function runStandardMastering(keepPostAnalysisUi = false): Promise<MasterResponse | null> {
    if (!file) {
      setError("Please upload a WAV or MP3 file first.");
      return null;
    }
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      setError(`File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.`);
      return null;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    setDownloadUrl(null);
    if (!keepPostAnalysisUi) {
      setShowAdaptivePlaceholder(false);
      setAdaptiveUnlocked(false);
      setAdaptiveUpgradeUrl(null);
      setAdaptiveIntent("");
      setConfirmedContinueWithStandard(false);
    }
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
      const masterPayload = payload as MasterResponse;
      setResult(masterPayload);
      setLastStandardResult(masterPayload);
      setAdaptiveModeActive(false);
      setStatus("Preview ready. Enter email to unlock final master.");
      return masterPayload;
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
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function checkAdaptiveAccess(): Promise<AdaptiveAccessResponse> {
    debugAdaptive("adaptive access request started");
    const response = await fetch("/api/adaptive-access", { method: "GET" });
    const payload = await readResponsePayload(response);
    debugAdaptive("adaptive access response received", {
      ok: response.ok,
      status: response.status,
      payload
    });
    if (!response.ok) {
      const apiError = typeof payload?.error === "string" ? payload.error : null;
      throw new Error(apiError ?? "Unable to verify adaptive access.");
    }
    if (!payload || typeof payload !== "object" || !("entitled" in payload)) {
      throw new Error("Adaptive access response was empty or invalid.");
    }
    return payload as AdaptiveAccessResponse;
  }

  async function runAdaptiveMastering(): Promise<void> {
    if (!adaptiveUnlocked) {
      debugAdaptive("adaptive processing blocked: adaptive is not unlocked");
      setError("Unlock Adaptive AI Mastering first.");
      return;
    }
    debugAdaptive("adaptive processing started", {
      hasIntent: adaptiveIntent.trim().length > 0,
      genre,
      loudness
    });
    setAdaptiveProcessing(true);
    setError(null);
    setStatus("Preparing standard baseline for adaptive comparison...");

    try {
      let standard = lastStandardResult;
      if (!standard) {
        standard = await runStandardMastering(true);
      }
      if (!standard) {
        throw new Error("Standard baseline is required before Adaptive AI Mastering.");
      }

      setStatus("Running Adaptive AI Mastering...");
      const response = await fetch("/api/master-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          standardMasterFileId: standard.download.fileId,
          standardMasterJobId: standard.jobId,
          preset: genre,
          loudnessMode: loudness,
          user_intent: adaptiveIntent.trim() || undefined
        })
      });
      const payload = await readResponsePayload(response);
      debugAdaptive("adaptive processing response received", {
        ok: response.ok,
        status: response.status,
        payload
      });
      if (!response.ok) {
        const apiError = typeof payload?.error === "string" ? payload.error : null;
        if (apiError === "adaptive_upgrade_required") {
          const upgradeUrl =
            typeof payload?.upgradeUrl === "string" && payload.upgradeUrl.length > 0 ? payload.upgradeUrl : "/pricing";
          setAdaptiveUpgradeUrl(upgradeUrl);
        }
        throw new Error(apiError ?? "Adaptive mastering failed.");
      }
      if (!payload || !("jobId" in payload) || !("previews" in payload) || !("download" in payload)) {
        throw new Error("Adaptive mastering response was empty or invalid.");
      }
      const adaptive = payload as MasterAiResponse;
      const mergedResult: MasterResponse = {
        jobId: adaptive.jobId,
        previews: {
          original: standard.previews.original,
          mastered: adaptive.previews.adaptive
        },
        download: adaptive.download,
        analysis:
          adaptive.analysis.adaptive ?? {
            durationSec: adaptive.analysis.standard.durationSec,
            integratedLufs: adaptive.analysis.standard.integratedLufs,
            peakDb: adaptive.analysis.standard.peakDb,
            crestDb: adaptive.analysis.standard.crestDb,
            notes: adaptive.analysis.standard.notes
          }
      };
      setResult(mergedResult);
      setDownloadUrl(null);
      setAdaptiveModeActive(true);
      setStatus("Adaptive preview ready. Compare Original vs Adaptive, then unlock export.");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Unexpected adaptive error.";
      setError(raw);
      setStatus("Adaptive mastering failed. Please try again.");
    } finally {
      setAdaptiveProcessing(false);
    }
  }

  async function runPreMasterAnalysis(): Promise<void> {
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
    setShowAdaptivePlaceholder(false);
    setPreMasterAnalysis(null);
    setPreMasterDebug(null);
    setConfirmedContinueWithStandard(false);
    setStatus("Analyzing track readiness...");
    const requestId = latestAnalysisRequestIdRef.current + 1;
    latestAnalysisRequestIdRef.current = requestId;

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("genre", genre);
      formData.append("loudnessMode", loudness);
      if (process.env.NODE_ENV !== "production") {
        console.log("[PREMASTER_DEBUG] submit /api/analyze-track", {
          requestId,
          fileName: file.name,
          fileSize: file.size,
          genre,
          loudnessMode: loudness
        });
      }

      const response = await fetch("/api/analyze-track", { method: "POST", body: formData });
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        const apiError = typeof payload?.error === "string" ? payload.error : null;
        throw new Error(apiError ?? "Track analysis failed.");
      }

      if (!payload || !("analysis" in payload)) {
        throw new Error("Track analysis response was empty or invalid.");
      }

      const parsed = payload as PreMasterAnalysisResponse;
      if (requestId !== latestAnalysisRequestIdRef.current) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[PREMASTER_DEBUG] stale analysis response ignored", { requestId });
        }
        return;
      }
      setPreMasterAnalysis(parsed.analysis);
      setPreMasterDebug(parsed.debug ?? null);
      setAdaptiveUnlocked(adaptiveEntitled);
      setAdaptiveUpgradeUrl(adaptiveEntitled ? null : buildAdaptiveUpgradeUrl());
      setAdaptiveIntent("");
      setAdaptiveModeActive(false);
      setLastStandardResult(null);
      if (resumeAdaptiveAfterUpgrade && adaptiveEntitled) {
        setShowAdaptivePlaceholder(true);
        setStatus("Adaptive unlocked. Add optional direction and run it.");
      } else {
        setStatus("Track analysis complete. Choose your mastering path.");
      }
    } catch (err) {
      if (requestId !== latestAnalysisRequestIdRef.current) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[PREMASTER_DEBUG] stale analysis error ignored", { requestId });
        }
        return;
      }
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      if (isLikelyNetworkError(err)) {
        setError(
          isLocalhost
            ? "Could not reach the server. If you are on localhost, keep npm run dev running and try again."
            : "Could not reach the server. Please try again in a moment. If it keeps failing, refresh and retry."
        );
      } else {
        const raw = err instanceof Error ? err.message : "Unexpected error.";
        setError(raw);
      }
      setStatus("Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preMasterAnalysisEnabled) {
      await runPreMasterAnalysis();
      return;
    }
    await runStandardMastering();
  }

  function applyOwnerBypassFromDraft() {
    const trimmed = ownerBypassDraft.trim();
    if (trimmed) {
      sessionStorage.setItem(MASTER_ADMIN_BYPASS_STORAGE_KEY, trimmed);
      setOwnerSessionToken(trimmed);
    } else {
      sessionStorage.removeItem(MASTER_ADMIN_BYPASS_STORAGE_KEY);
      setOwnerSessionToken("");
    }
  }

  function clearOwnerBypass() {
    sessionStorage.removeItem(MASTER_ADMIN_BYPASS_STORAGE_KEY);
    setOwnerBypassDraft("");
    setOwnerSessionToken("");
  }

  function handleLimitModalViewPlans() {
    setDownloadLimitModalOpen(false);
    window.location.assign("/pricing");
  }

  return (
    <section id="master" style={panelStyle}>
      {ownerTestingPanel ? (
        <div style={ownerTestingPanelStyle}>
          <p style={ownerTestingTitleStyle}>Local owner testing only</p>
          <p style={ownerTestingHintStyle}>
            Stored only in this browser session. Not sent to analytics. Paste an owner token to add both{" "}
            <code style={ownerTestingCodeStyle}>x-master-admin-bypass</code> header on GET{" "}
            <code style={ownerTestingCodeStyle}>/api/download</code> quota checks and{" "}
            <code style={ownerTestingCodeStyle}>x-master-owner-token</code> for strict validation.
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
          <p style={ownerTestingTokenHelperStyle}>A valid saved token is required before override can arm.</p>
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
            {ownerOverrideArmed ? "Override armed (valid session token present)" : "Override not armed"}
          </div>
          <p style={ownerTestingDebugLineStyle}>
            Bypass available for final export: {ownerSessionToken ? "yes" : "no"}
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
                onClick={() => {
                  setGenre(key as keyof typeof GENRE_PRESETS);
                  latestAnalysisRequestIdRef.current += 1;
                  setPreMasterAnalysis(null);
                  setPreMasterDebug(null);
                  setShowAdaptivePlaceholder(false);
                  setConfirmedContinueWithStandard(false);
                }}
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
                onClick={() => {
                  setLoudness(key as LoudnessMode);
                  latestAnalysisRequestIdRef.current += 1;
                  setPreMasterAnalysis(null);
                  setPreMasterDebug(null);
                  setShowAdaptivePlaceholder(false);
                  setConfirmedContinueWithStandard(false);
                }}
                style={loudness === key ? loudnessCardActiveStyle : loudnessCardStyle}
              >
                <span style={loudnessTitleStyle}>{mode.label}</span>
                <span style={loudnessDescriptionStyle}>{mode.notes}</span>
              </button>
            ))}
          </div>
        </div>

        {(!preMasterAnalysisEnabled || !preMasterAnalysis) ? (
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "Analyzing..." : "Analyze Your Track"}
          </button>
        ) : null}
      </form>

      {preMasterAnalysisEnabled && preMasterAnalysis ? (
        <div style={analysisCardStyle}>
          <h3 style={analysisHeadingStyle}>Track Analysis Complete</h3>
          <p style={analysisVerdictStyle}>{preMasterAnalysis.verdict}</p>
          <div style={analysisMetricsGridStyle}>
            <div style={analysisMetricItemStyle}>
              <p style={analysisMetricLabelStyle}>Loudness</p>
              <p style={analysisMetricValueStyle}>
                {preMasterAnalysis.loudness.valueLufs !== null ? `${preMasterAnalysis.loudness.valueLufs} LUFS` : "N/A"}
              </p>
              <p style={analysisMetricHintStyle}>{preMasterAnalysis.loudness.status}</p>
            </div>
            <div style={analysisMetricItemStyle}>
              <p style={analysisMetricLabelStyle}>Peak safety</p>
              <p style={analysisMetricValueStyle}>
                {preMasterAnalysis.peakSafety.valueDb !== null ? `${preMasterAnalysis.peakSafety.valueDb} dB` : "N/A"}
              </p>
              <p style={analysisMetricHintStyle}>{preMasterAnalysis.peakSafety.status}</p>
            </div>
            <div style={analysisMetricItemStyle}>
              <p style={analysisMetricLabelStyle}>Dynamic control</p>
              <p style={analysisMetricValueStyle}>
                {preMasterAnalysis.dynamicControl.valueDb !== null
                  ? `${preMasterAnalysis.dynamicControl.valueDb} dB crest`
                  : "N/A"}
              </p>
              <p style={analysisMetricHintStyle}>{preMasterAnalysis.dynamicControl.status}</p>
            </div>
          </div>
          <p style={analysisRecommendationStyle}>{preMasterAnalysis.recommendation}</p>
          {!isProduction && preMasterDebug ? (
            <div style={analysisDebugBoxStyle}>
              <p style={analysisDebugTitleStyle}>Debug (development only)</p>
              <p style={analysisDebugLineStyle}>filename: {preMasterDebug.filename ?? "N/A"}</p>
              <p style={analysisDebugLineStyle}>
                integratedLufs: {preMasterDebug.rawMetrics?.integratedLufs ?? "N/A"}
              </p>
              <p style={analysisDebugLineStyle}>peakDb: {preMasterDebug.rawMetrics?.peakDb ?? "N/A"}</p>
              <p style={analysisDebugLineStyle}>crestDb: {preMasterDebug.rawMetrics?.crestDb ?? "N/A"}</p>
              <p style={analysisDebugLineStyle}>verdict: {preMasterAnalysis.verdict}</p>
            </div>
          ) : null}
          <div style={analysisActionRowStyle}>
            <button
              type="button"
              disabled={loading}
              style={buttonStyle}
              onClick={() => {
                setConfirmedContinueWithStandard(true);
                void runStandardMastering();
              }}
            >
              {loading ? "Mastering..." : "Continue with Standard Mastering"}
            </button>
            <button
              type="button"
              disabled={adaptiveProcessing || loading}
              style={secondaryActionStyle}
              onClick={() => {
                if (adaptiveEntitled) {
                  setShowAdaptivePlaceholder(true);
                  setAdaptiveUnlocked(true);
                  setAdaptiveUpgradeUrl(null);
                  setStatus("Adaptive unlocked. Add optional direction and run it.");
                  return;
                }
                debugAdaptive("button click fired", {
                  adaptiveProcessing,
                  loading,
                  hasPreMasterAnalysis: Boolean(preMasterAnalysis)
                });
                setShowAdaptivePlaceholder(true);
                debugAdaptive("adaptive UI state enabled", { showAdaptivePlaceholder: true });
                setError(null);
                setStatus("Checking Adaptive AI Mastering access...");
                void checkAdaptiveAccess()
                  .then((access) => {
                    if (!access) {
                      throw new Error("Adaptive access response was null.");
                    }
                    if (access.entitled) {
                      debugAdaptive("bypass/local access detected", {
                        entitled: access.entitled,
                        planId: access.planId,
                        upgradeUrl: access.upgradeUrl
                      });
                      setAdaptiveEntitled(true);
                      setAdaptiveUnlocked(true);
                      setAdaptiveUpgradeUrl(null);
                      debugAdaptive("adaptive UI state enabled", { adaptiveUnlocked: true });
                      setStatus("Adaptive unlocked. Add optional direction and run it.");
                      return;
                    }
                    debugAdaptive("adaptive access denied", {
                      entitled: access.entitled,
                      planId: access.planId,
                      upgradeUrl: access.upgradeUrl
                    });
                    setAdaptiveUnlocked(false);
                    setAdaptiveEntitled(false);
                    const upgradeUrl = buildAdaptiveUpgradeUrl();
                    setAdaptiveUpgradeUrl(upgradeUrl);
                    setStatus("Adaptive requires premium unlock before processing. Redirecting to upgrade...");
                    window.location.assign(upgradeUrl);
                  })
                  .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : "Unable to verify adaptive access.";
                    setError(message);
                    setStatus("Could not verify adaptive access.");
                  });
              }}
            >
              Unlock Adaptive AI Mastering
            </button>
          </div>
          {showAdaptivePlaceholder ? (
            <div style={adaptivePlaceholderStyle}>
              {adaptiveUnlocked ? (
                <>
                  <label htmlFor="adaptive-intent" style={adaptiveIntentLabelStyle}>
                    Describe how you want your song to sound
                  </label>
                  <textarea
                    id="adaptive-intent"
                    value={adaptiveIntent}
                    onChange={(event) => setAdaptiveIntent(event.target.value)}
                    placeholder="More punch for clubs, warmer vocals, cleaner low end, loud and modern for streaming..."
                    rows={4}
                    style={adaptiveIntentTextareaStyle}
                  />
                  <p style={adaptiveIntentHintStyle}>
                    Optional. This is only used for Adaptive AI Mastering as <code style={ownerTestingCodeStyle}>user_intent</code>.
                  </p>
                  <button
                    type="button"
                    disabled={adaptiveProcessing || loading}
                    style={buttonStyle}
                    onClick={() => {
                      void runAdaptiveMastering();
                    }}
                  >
                    {adaptiveProcessing ? "Adaptive Mastering..." : "Run Adaptive AI Mastering"}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ margin: 0 }}>
                    Adaptive AI Mastering is premium and must be unlocked before processing.
                  </p>
                  {adaptiveUpgradeUrl ? (
                    <a href={adaptiveUpgradeUrl} style={adaptiveUpgradeLinkStyle}>
                      Upgrade to unlock Adaptive
                    </a>
                  ) : (
                    <p style={analysisContinueHintStyle}>Checking entitlement or waiting for unlock.</p>
                  )}
                </>
              )}
            </div>
          ) : null}
          {confirmedContinueWithStandard ? (
            <p style={analysisContinueHintStyle}>Continuing with the existing Standard Mastering flow.</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p style={error === DOWNLOAD_LIMIT_MESSAGE ? quotaExhaustedMessageStyle : errorStyle}>{error}</p>
      ) : null}

      {result ? (
        <div style={resultAreaStyle}>
          <MasterReadyCallout
            quotaLine={
              result.quota ? (
                <p
                  style={{
                    margin: "14px 0 0",
                    color: result.quota.remainingMasters > 0 ? "#7dccb0" : "#a8c4bb",
                    fontSize: "0.82rem",
                    lineHeight: 1.55
                  }}
                >
                  {result.quota.remainingMasters > 0 ? (
                    <>
                      {result.quota.mastersUsedThisPeriod} / {result.quota.monthlyMastersLimit} masters used.{" "}
                      {result.quota.remainingMonthlyMasters} monthly left
                      {result.quota.creditPackBalance > 0 ? ` + ${result.quota.creditPackBalance} credit pack` : ""}.
                      {result.quota.remainingMasters <= 2 ? " Running low — upgrade or get 5 more for $4" : ""}
                      {result.quota.planId === "free" ? (
                        <>
                          {" "}
                          <a href="/pricing" style={{ color: "#7dccb0", textDecoration: "underline" }}>
                            Get 5 more for $4
                          </a>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {DOWNLOAD_LIMIT_MESSAGE}{" "}
                      <a href="/pricing" style={{ color: "#7dccb0", textDecoration: "underline" }}>
                        View pricing
                      </a>
                    </>
                  )}
                </p>
              ) : (
                <p style={quotaUnknownLineStyle}>
                  Plans include monthly masters and optional credit packs. Usage is tied to your verified email and enforced
                  only on final mastered exports.
                </p>
              )
            }
          />
          <AudioCompare
            originalPreviewUrl={result.previews.original}
            masteredPreviewUrl={result.previews.mastered}
            originalLabel="Original"
            originalSubLabel="Your uploaded track"
            masteredLabel={adaptiveModeActive ? "Adaptive AI Master" : "Mastered"}
            masteredSubLabel={adaptiveModeActive ? "AI mastering output" : "Enhanced by MasterSauce"}
          />
          {!downloadUrl ? (
            <EmailCaptureForm jobId={result.jobId} fileId={result.download.fileId} onUnlocked={setDownloadUrl} />
          ) : (
            <button
              type="button"
              style={downloadStyle}
              onClick={() => {
                void downloadFinalMasterWithOptionalBypass(
                  downloadUrl,
                  resolveOwnerSessionToken(ownerTestingPanel)
                ).catch((e) => {
                  const message = e instanceof Error ? e.message : "Download failed.";
                  if (e instanceof Error && e.name === "DownloadLimitExceededError") {
                    setError(null);
                    setDownloadLimitModalOpen(true);
                    return;
                  }
                  setError(message);
                });
              }}
            >
              Export Final Master
            </button>
          )}
        </div>
      ) : null}
      <DownloadLimitModal
        open={downloadLimitModalOpen}
        onClose={() => setDownloadLimitModalOpen(false)}
        onViewPlans={handleLimitModalViewPlans}
      />
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

/** Shown for download-limit messaging — calm, not “error red”. */
const quotaExhaustedMessageStyle: React.CSSProperties = {
  color: "#a8c4bb",
  marginTop: "12px",
  lineHeight: 1.55,
  fontSize: "0.95rem"
};

const quotaUnknownLineStyle: React.CSSProperties = {
  margin: "14px 0 0",
  color: "#8fb3a8",
  fontSize: "0.82rem",
  lineHeight: 1.55
};

const resultAreaStyle: React.CSSProperties = { marginTop: "20px", display: "grid", gap: "16px" };

const analysisCardStyle: React.CSSProperties = {
  marginTop: "16px",
  borderRadius: "18px",
  border: "1px solid rgba(126, 146, 220, 0.32)",
  background: "linear-gradient(160deg, rgba(17, 25, 46, 0.9), rgba(12, 18, 34, 0.94))",
  padding: "16px",
  display: "grid",
  gap: "12px"
};
const analysisHeadingStyle: React.CSSProperties = {
  margin: 0,
  color: "#d8e4ff",
  fontSize: "1.03rem",
  fontWeight: 700
};
const analysisVerdictStyle: React.CSSProperties = {
  margin: 0,
  color: "#eef3ff",
  fontSize: "1.2rem",
  fontWeight: 700
};
const analysisMetricsGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))"
};
const analysisMetricItemStyle: React.CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(92, 111, 174, 0.35)",
  background: "rgba(10, 16, 30, 0.72)",
  padding: "10px",
  display: "grid",
  gap: "4px"
};
const analysisMetricLabelStyle: React.CSSProperties = {
  margin: 0,
  color: "#97a8da",
  fontSize: "0.8rem"
};
const analysisMetricValueStyle: React.CSSProperties = {
  margin: 0,
  color: "#e7eeff",
  fontWeight: 700
};
const analysisMetricHintStyle: React.CSSProperties = {
  margin: 0,
  color: "#a7b4db",
  fontSize: "0.78rem",
  lineHeight: 1.45
};
const analysisRecommendationStyle: React.CSSProperties = {
  margin: 0,
  color: "#c4d1f5",
  lineHeight: 1.55
};
const analysisDebugBoxStyle: React.CSSProperties = {
  borderRadius: "10px",
  border: "1px dashed rgba(116, 134, 194, 0.5)",
  background: "rgba(8, 12, 24, 0.8)",
  padding: "10px 12px",
  display: "grid",
  gap: "4px"
};
const analysisDebugTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#9db2ef",
  fontSize: "0.76rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 700
};
const analysisDebugLineStyle: React.CSSProperties = {
  margin: 0,
  color: "#b9c7ef",
  fontSize: "0.8rem",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
};
const analysisActionRowStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
};
const secondaryActionStyle: React.CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(128, 145, 206, 0.58)",
  background: "rgba(13, 19, 36, 0.9)",
  color: "#d5ddfb",
  fontWeight: 700,
  fontSize: "0.95rem",
  padding: "14px 16px",
  cursor: "pointer"
};
const adaptivePlaceholderStyle: React.CSSProperties = {
  borderRadius: "10px",
  border: "1px dashed rgba(138, 149, 196, 0.45)",
  background: "rgba(10, 15, 28, 0.7)",
  color: "#afbbdf",
  fontSize: "0.88rem",
  padding: "10px 12px",
  display: "grid",
  gap: "10px"
};
const adaptiveIntentLabelStyle: React.CSSProperties = {
  margin: 0,
  color: "#d8e2ff",
  fontWeight: 700
};
const adaptiveIntentTextareaStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "10px",
  border: "1px solid rgba(116, 133, 191, 0.6)",
  background: "rgba(8, 13, 25, 0.85)",
  color: "#eef3ff",
  padding: "10px 12px",
  fontSize: "0.9rem",
  lineHeight: 1.45,
  resize: "vertical"
};
const adaptiveIntentHintStyle: React.CSSProperties = {
  margin: 0,
  color: "#9eb0dd",
  fontSize: "0.8rem"
};
const adaptiveUpgradeLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  textDecoration: "none",
  borderRadius: "10px",
  border: "1px solid rgba(128, 145, 206, 0.58)",
  background: "rgba(13, 19, 36, 0.9)",
  color: "#d5ddfb",
  fontWeight: 700,
  padding: "10px 14px"
};
const analysisContinueHintStyle: React.CSSProperties = {
  margin: 0,
  color: "#91a6de",
  fontSize: "0.82rem"
};

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
