"use client";

import { FormEvent, useState } from "react";
import { readResponsePayload } from "@/lib/http/read-response-payload";
import {
  MASTERSOUCE_ADAPTIVE_CHECKOUT_SESSION_KEY,
  MASTERSOUCE_BILLING_EMAIL_KEY
} from "@/lib/billing/client-key";
import { buildAdaptiveCheckoutReturnTo } from "@/lib/billing/adaptive-pricing-link";
import type { PendingAdaptiveExportV1 } from "@/lib/billing/pending-adaptive-export";
import { savePendingAdaptiveExport } from "@/lib/billing/pending-adaptive-export";

type ExportAccessPayload = {
  entitled?: boolean;
  requiresCheckout?: boolean;
  downloadUrl?: string | null;
  status?: string;
  reason?: string;
  error?: string;
  alreadyEntitled?: boolean;
  message?: string;
  url?: string;
  canRetry?: boolean;
  syncAttempted?: boolean;
};

type AdaptiveExportGateProps = {
  jobId: string;
  fileId: string;
  pendingCheckoutSnapshot: PendingAdaptiveExportV1;
  onUnlocked: (downloadUrl: string) => void;
};

function clearStoredAdaptiveCheckoutSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MASTERSOUCE_ADAPTIVE_CHECKOUT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function AdaptiveExportGate({ jobId, fileId, pendingCheckoutSnapshot, onUnlocked }: AdaptiveExportGateProps) {
  const [email, setEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(MASTERSOUCE_BILLING_EMAIL_KEY)?.trim() ?? "";
  });
  const [loading, setLoading] = useState(false);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needsCheckoutPath, setNeedsCheckoutPath] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter the billing email you used (or will use) at checkout.");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      sessionStorage.setItem(MASTERSOUCE_BILLING_EMAIL_KEY, trimmed);
      console.log("[ADAPTIVE_UI] export gate: entitlement request");
      const response = await fetch("/api/adaptive/export-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, jobId, fileId })
      });
      const payload = (await readResponsePayload(response)) as ExportAccessPayload | null;
      if (payload?.entitled && typeof payload.downloadUrl === "string" && payload.downloadUrl.length > 0) {
        console.log("[ADAPTIVE_UI] export gate: unlocked via entitlement");
        setNeedsCheckoutPath(false);
        clearStoredAdaptiveCheckoutSession();
        onUnlocked(payload.downloadUrl);
        return;
      }
      if (payload?.requiresCheckout) {
        console.log("[ADAPTIVE_UI] export gate: requires checkout", { reason: payload.reason });
        setNeedsCheckoutPath(true);
        setInfo(
          "No active Adaptive subscription found for this billing email yet. If you already completed payment, use the same billing email and check again — billing sync can take a moment after checkout. You can continue to checkout below, or re-check access without paying again."
        );
        return;
      }
      const apiError = typeof payload?.error === "string" ? payload.error : null;
      throw new Error(apiError ?? "Unable to verify Adaptive export access.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecheckAccess() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter the billing email you used at checkout.");
      return;
    }
    setRecheckLoading(true);
    setError(null);
    setInfo(null);
    try {
      sessionStorage.setItem(MASTERSOUCE_BILLING_EMAIL_KEY, trimmed);
      const checkoutSessionId =
        typeof window !== "undefined"
          ? sessionStorage.getItem(MASTERSOUCE_ADAPTIVE_CHECKOUT_SESSION_KEY)?.trim()
          : undefined;
      console.log("[ADAPTIVE_UI] export gate: manual re-check access");
      const response = await fetch("/api/adaptive/export-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          jobId,
          fileId,
          recheck: true,
          ...(checkoutSessionId?.startsWith("cs_") ? { checkoutSessionId } : {})
        })
      });
      const payload = (await readResponsePayload(response)) as ExportAccessPayload | null;
      if (payload?.entitled && typeof payload.downloadUrl === "string" && payload.downloadUrl.length > 0) {
        console.log("[ADAPTIVE_UI] export gate: unlocked after manual re-check");
        setNeedsCheckoutPath(false);
        clearStoredAdaptiveCheckoutSession();
        onUnlocked(payload.downloadUrl);
        return;
      }
      if (payload?.requiresCheckout) {
        setNeedsCheckoutPath(true);
        setInfo(
          "Still no active Adaptive subscription for this email. If you just paid, wait a few seconds and try “Re-check access” again, or continue to checkout if you have not subscribed yet."
        );
        return;
      }
      const apiError = typeof payload?.error === "string" ? payload.error : null;
      throw new Error(apiError ?? "Unable to re-check Adaptive export access.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-check failed.");
    } finally {
      setRecheckLoading(false);
    }
  }

  async function handleContinueToCheckout() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter your billing email first so we can match it after checkout.");
      return;
    }
    setCheckoutLoading(true);
    setError(null);
    setInfo(null);
    try {
      sessionStorage.setItem(MASTERSOUCE_BILLING_EMAIL_KEY, trimmed);
      savePendingAdaptiveExport(pendingCheckoutSnapshot);

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "subscription",
          planId: "creator_monthly",
          email: trimmed,
          returnTo: buildAdaptiveCheckoutReturnTo(),
          intent: "adaptive"
        })
      });
      const payload = (await res.json()) as ExportAccessPayload;
      if (payload?.alreadyEntitled) {
        console.log("[ADAPTIVE_UI] checkout skipped: already entitled");
        const verify = await fetch("/api/adaptive/export-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed, jobId, fileId })
        });
        const v = (await readResponsePayload(verify)) as ExportAccessPayload | null;
        if (v?.entitled && typeof v.downloadUrl === "string") {
          setNeedsCheckoutPath(false);
          clearStoredAdaptiveCheckoutSession();
          onUnlocked(v.downloadUrl);
          return;
        }
        setError(typeof payload.message === "string" ? payload.message : "Already subscribed — try unlocking again.");
        return;
      }
      if (typeof payload?.url === "string" && payload.url.length > 0) {
        console.log("[ADAPTIVE_UI] redirecting to Stripe checkout");
        window.location.assign(payload.url);
        return;
      }
      throw new Error(typeof payload?.error === "string" ? payload.error : "Checkout could not start.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  const busy = loading || recheckLoading || checkoutLoading;

  return (
    <section style={panelStyle}>
      <div style={iconStyle}>⬇</div>
      <h3 style={headingStyle}>Export Final Adaptive Master</h3>
      <p style={mutedText}>
        <strong style={{ color: "#e2e8ff" }}>Adaptive Preview is free.</strong>
        <br />
        Enter your billing email to export the final master.
      </p>
      <form onSubmit={handleSubmit} style={formStyle}>
        <label htmlFor="adaptive-billing-email" style={labelStyle}>
          Billing email
        </label>
        <input
          id="adaptive-billing-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setNeedsCheckoutPath(false);
            setInfo(null);
          }}
          placeholder="same email as Stripe checkout"
          required
          style={inputStyle}
          autoComplete="email"
        />
        <button type="submit" disabled={busy} style={buttonStyle}>
          {loading ? "Checking…" : "Check access & unlock export"}
        </button>
      </form>
      {!needsCheckoutPath ? (
        <p style={hintStyle}>
          We verify your subscription from billing records — no login required. If you already subscribe, use the same billing
          email and tap check access.
        </p>
      ) : null}
      {needsCheckoutPath ? (
        <div style={checkoutActionsStyle}>
          {info ? <p style={infoStyle}>{info}</p> : null}
          <button
            type="button"
            disabled={busy}
            style={buttonStyle}
            onClick={() => void handleContinueToCheckout()}
          >
            {checkoutLoading ? "Starting checkout…" : "Continue to checkout for Adaptive access"}
          </button>
          <button
            type="button"
            disabled={busy}
            style={secondaryButtonStyle}
            onClick={() => void handleRecheckAccess()}
          >
            {recheckLoading ? "Re-checking…" : "Already paid? Re-check access"}
          </button>
        </div>
      ) : null}
      <p style={privacyNoteStyle}>We use this email only to match your Stripe subscription and unlock export.</p>
      {error ? <p style={errorStyle}>{error}</p> : null}
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  background:
    "radial-gradient(640px 220px at 80% -30%, rgba(113, 74, 255, 0.24), rgba(113,74,255,0) 66%), linear-gradient(165deg, rgba(24, 35, 63, 0.72), rgba(14, 22, 40, 0.72))",
  border: "1px solid rgba(141, 114, 241, 0.4)",
  borderRadius: "22px",
  padding: "28px",
  textAlign: "center",
  maxWidth: "520px",
  margin: "0 auto"
};
const iconStyle: React.CSSProperties = {
  width: "64px",
  height: "64px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  margin: "0 auto 10px",
  color: "#fff",
  fontSize: "1.15rem",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  boxShadow: "0 12px 32px rgba(121, 100, 255, 0.44)"
};
const headingStyle: React.CSSProperties = {
  color: "#f0f4ff",
  margin: "0 0 8px 0",
  fontSize: "clamp(1.35rem, 2.5vw, 1.85rem)",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};
const mutedText: React.CSSProperties = {
  color: "#a8b3d8",
  margin: "0 0 16px 0",
  lineHeight: 1.55,
  fontSize: "0.95rem"
};
const formStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px"
};
const labelStyle: React.CSSProperties = {
  textAlign: "left",
  color: "#c4cef5",
  fontSize: "0.82rem",
  fontWeight: 600
};
const inputStyle: React.CSSProperties = {
  borderRadius: "14px",
  border: "1px solid #415085",
  background: "rgba(8, 12, 24, 0.84)",
  color: "#f5f8ff",
  padding: "13px 13px"
};
const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: "14px",
  background: "linear-gradient(125deg, #8b79ff 0%, #5e7dff 100%)",
  color: "#ffffff",
  padding: "13px 16px",
  cursor: "pointer",
  fontWeight: 700
};
const secondaryButtonStyle: React.CSSProperties = {
  marginTop: "10px",
  borderRadius: "14px",
  border: "1px solid rgba(128, 145, 206, 0.58)",
  background: "rgba(13, 19, 36, 0.9)",
  color: "#d5ddfb",
  padding: "12px 16px",
  cursor: "pointer",
  fontWeight: 700,
  width: "100%"
};
const checkoutActionsStyle: React.CSSProperties = {
  marginTop: "14px",
  display: "grid",
  gap: "10px"
};
const hintStyle: React.CSSProperties = {
  margin: "12px 0 0",
  color: "#8e9ac0",
  fontSize: "0.84rem",
  lineHeight: 1.5
};
const privacyNoteStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#6d7a9e",
  fontSize: "0.78rem",
  lineHeight: 1.45
};
const errorStyle: React.CSSProperties = {
  color: "#ff8ba8",
  marginTop: "10px"
};
const infoStyle: React.CSSProperties = {
  color: "#a8c4bb",
  marginBottom: "4px",
  lineHeight: 1.5,
  fontSize: "0.88rem"
};
