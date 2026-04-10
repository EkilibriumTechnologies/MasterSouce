"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

/** Session-only; used only when set via owner testing panel (`?owner=1`). Never logged. */
const MASTER_ADMIN_BYPASS_STORAGE_KEY = "master_admin_bypass_token";
import { AudioCompare } from "@/components/audio-compare";
import { DownloadLimitModal } from "@/components/download-limit-modal";
import { AdaptiveExportGate } from "@/components/adaptive-export-gate";
import { EmailCaptureForm } from "@/components/email-capture-form";
import { MasterReadyCallout } from "@/components/master-ready-callout";
import type { MasterAiResponse } from "@/lib/api/adaptive-master";
import { GENRE_PRESETS, LOUDNESS_MODES, LoudnessMode } from "@/lib/genre-presets";
import type { MasterJobAnalysis } from "@/lib/api/master-analysis";
import { buildAdaptivePricingLink } from "@/lib/billing/adaptive-pricing-link";
import {
  MASTERSOUCE_ADAPTIVE_CHECKOUT_SESSION_KEY,
  MASTERSOUCE_BILLING_EMAIL_KEY
} from "@/lib/billing/client-key";
import { clearPendingAdaptiveExport, loadPendingAdaptiveExport } from "@/lib/billing/pending-adaptive-export";
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

function readStoredBillingEmail(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(MASTERSOUCE_BILLING_EMAIL_KEY)?.trim() ?? "";
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
  const [adaptiveIntent, setAdaptiveIntent] = useState("");
  const [adaptiveProcessing, setAdaptiveProcessing] = useState(false);
  const [adaptiveModeActive, setAdaptiveModeActive] = useState(false);
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
    const checkoutSuccess = params.get("checkout") === "success";
    const adaptiveReturn =
      checkoutSuccess && (params.get("intent") === "adaptive" || params.get("upgraded") === "1");
    if (!adaptiveReturn) return;

    let disposed = false;
    void (async () => {
      const sessionId = params.get("session_id");
      if (sessionId?.startsWith("cs_")) {
        try {
          sessionStorage.setItem(MASTERSOUCE_ADAPTIVE_CHECKOUT_SESSION_KEY, sessionId);
        } catch {
          /* ignore */
        }
        try {
          const syncRes = await fetch("/api/billing/sync", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ checkoutSessionId: sessionId })
          });
          const syncPayload = await readResponsePayload(syncRes);
          const norm = typeof syncPayload?.normalizedEmail === "string" ? syncPayload.normalizedEmail : null;
          if (norm) sessionStorage.setItem(MASTERSOUCE_BILLING_EMAIL_KEY, norm);
          debugAdaptive("post-checkout billing sync", { ok: syncRes.ok, normalizedEmail: norm });
        } catch {
          /* webhook may already have synced */
        }
      }
      if (disposed) return;

      const pending = loadPendingAdaptiveExport();
      if (!pending) {
        setStatus(
          "Checkout complete. Run a free customized preview, then use Export Final Adaptive Master with your billing email."
        );
        return;
      }

      setStatus("Verifying customized master export after checkout…");
      const maxAttempts = 8;
      const retryDelayMs = 1200;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (disposed) return;
        const emailStored = readStoredBillingEmail();
        if (emailStored) {
          console.log("[ADAPTIVE_UI] post_checkout: export-access attempt", { attempt });
          const res = await fetch("/api/adaptive/export-access", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              email: emailStored,
              jobId: pending.jobId,
              fileId: pending.fileId,
              ...(sessionId?.startsWith("cs_") && attempt >= 2
                ? { recheck: true, checkoutSessionId: sessionId }
                : {})
            })
          });
          const exportPayload = await readResponsePayload(res);
          const entitled =
            Boolean(exportPayload && typeof exportPayload === "object" && (exportPayload as { entitled?: boolean }).entitled);
          const downloadUrl =
            exportPayload && typeof exportPayload === "object"
              ? (exportPayload as { downloadUrl?: string }).downloadUrl
              : undefined;
          if (res.ok && entitled && typeof downloadUrl === "string" && downloadUrl.length > 0) {
            console.log("[ADAPTIVE_UI] adaptive export unlocked after billing sync success", {
              jobId: pending.jobId
            });
            try {
              sessionStorage.removeItem(MASTERSOUCE_ADAPTIVE_CHECKOUT_SESSION_KEY);
            } catch {
              /* ignore */
            }
            clearPendingAdaptiveExport();
            setAdaptiveModeActive(true);
            setResult({
              jobId: pending.jobId,
              previews: pending.previews,
              download: { requiresEmail: true, fileId: pending.fileId },
              analysis: pending.analysis,
              quota: pending.quota
            });
            setDownloadUrl(downloadUrl);
            setStatus("Customized master export ready — download your final master below.");
            return;
          }
        }

        if (attempt < maxAttempts) {
          setStatus("Finishing your upgrade… rechecking billing.");
          await delay(retryDelayMs);
        }
      }

      setStatus(
        "We could not verify your subscription yet (billing sync can take a moment). Open Export Final Adaptive Master, enter the same billing email, then use “Already paid? Re-check access” before trying checkout again."
      );
    })();

    return () => {
      disposed = true;
    };
  }, []);

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
    setAdaptiveIntent("");
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

      setStatus("Applying recommended master and generating previews…");
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
      setStatus("Recommended master preview ready. Enter email to unlock final master.");
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

  async function runAdaptiveMastering(): Promise<void> {
    console.log("[ADAPTIVE_UI] adaptive preview started");
    debugAdaptive("adaptive processing started", {
      hasIntent: adaptiveIntent.trim().length > 0,
      genre,
      loudness
    });
    setAdaptiveProcessing(true);
    setError(null);
    setStatus("Preparing your recommended baseline for customization…");

    try {
      let standard = lastStandardResult;
      if (!standard) {
        standard = await runStandardMastering(true);
      }
      if (!standard) {
        throw new Error("We need your recommended master first before customizing.");
      }

      setStatus("Shaping your customized master with AI (free preview)…");
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
      console.log("[ADAPTIVE_UI] adaptive preview completed", { jobId: adaptive.jobId });
      setStatus("Customized preview ready — compare below, then export the final Adaptive master.");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Unexpected adaptive error.";
      setError(raw);
      setStatus("Customized mastering couldn’t finish. Please try again.");
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
      setAdaptiveIntent("");
      setAdaptiveModeActive(false);
      setLastStandardResult(null);
      setStatus("Track analysis complete. Use the fast recommended master or customize your sound.");
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
              aria-busy={loading}
              aria-label={
                loading
                  ? "Applying recommended master"
                  : "Use recommended master — fast, automatic AI mastering"
              }
              onClick={() => {
                setConfirmedContinueWithStandard(true);
                void runStandardMastering();
              }}
            >
              {loading ? "Applying recommended master…" : "Use Recommended Master"}
            </button>
            <button
              type="button"
              disabled={adaptiveProcessing || loading}
              style={secondaryActionStyle}
              aria-label="Customize my master — describe your sound for AI-guided shaping"
              onClick={() => {
                debugAdaptive("try adaptive preview", { adaptiveProcessing, loading });
                setShowAdaptivePlaceholder(true);
                setError(null);
                setStatus("Customize your master — add optional direction, then run your free preview.");
              }}
            >
              Customize My Master
            </button>
          </div>
          {showAdaptivePlaceholder ? (
            <div style={adaptivePlaceholderStyle}>
              <p style={{ margin: 0, color: "#c4d1f5" }}>
                Preview your customized sound for free. Exporting the final customized master requires active Adaptive access
                tied to your billing email.
              </p>
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
                Optional. Sent to the AI as <code style={ownerTestingCodeStyle}>user_intent</code>.
              </p>
              <button
                type="button"
                disabled={adaptiveProcessing || loading}
                style={buttonStyle}
                aria-busy={adaptiveProcessing}
                aria-label={
                  adaptiveProcessing
                    ? "Shaping your customized master"
                    : "Run free preview of your customized master"
                }
                onClick={() => {
                  void runAdaptiveMastering();
                }}
              >
                {adaptiveProcessing ? "Shaping your custom master…" : "Run free customization preview"}
              </button>
              <p style={analysisContinueHintStyle}>
                Need access to export customized masters only?{" "}
                <a href={buildAdaptivePricingLink()} style={{ color: "#9eb7ff", textDecoration: "underline" }}>
                  View Adaptive pricing
                </a>
              </p>
            </div>
          ) : null}
          {confirmedContinueWithStandard ? (
            <p style={analysisContinueHintStyle}>
              Applying your recommended master — fast, automatic AI settings from your genre and loudness choices.
            </p>
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
            masteredLabel={adaptiveModeActive ? "Customized master" : "Mastered"}
            masteredSubLabel={
              adaptiveModeActive ? "AI-guided from your sound direction" : "Enhanced by MasterSauce"
            }
          />
          {!downloadUrl ? (
            adaptiveModeActive ? (
              <AdaptiveExportGate
                jobId={result.jobId}
                fileId={result.download.fileId}
                pendingCheckoutSnapshot={{
                  v: 1,
                  jobId: result.jobId,
                  fileId: result.download.fileId,
                  previews: result.previews,
                  analysis: result.analysis,
                  quota: result.quota
                }}
                onUnlocked={(url) => {
                  console.log("[ADAPTIVE_UI] export unlocked from gate");
                  setDownloadUrl(url);
                }}
              />
            ) : (
              <EmailCaptureForm jobId={result.jobId} fileId={result.download.fileId} onUnlocked={setDownloadUrl} />
            )
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
              {adaptiveModeActive ? "Download Final Adaptive Master" : "Export Final Master"}
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
