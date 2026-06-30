"use client";

import { FormEvent, useEffect, useState } from "react";
import { getGaClientId } from "@/lib/analytics/gtag";
import { readResponsePayload } from "@/lib/http/read-response-payload";
import {
  MASTERSOUCE_ADAPTIVE_CHECKOUT_SESSION_KEY,
  MASTERSOUCE_BILLING_EMAIL_HEADER,
  MASTERSOUCE_BILLING_EMAIL_KEY
} from "@/lib/billing/client-key";
import { buildAdaptiveCheckoutReturnTo } from "@/lib/billing/adaptive-pricing-link";
import type { PendingAdaptiveExportV1 } from "@/lib/billing/pending-adaptive-export";
import { savePendingAdaptiveExport } from "@/lib/billing/pending-adaptive-export";
import { trackAbEvent, trackEvent } from "@/lib/analytics/ab-comparison";
import { trackMasteringFunnelEvent } from "@/lib/analytics/mastering-funnel";
import { trackSubscriptionButtonClick } from "@/lib/analytics/subscription-button";
import type { MasteringAnalyticsContext } from "@/lib/analytics/mastering-context";
import {
  getSubscriptionPlanMetadata,
  subscriptionButtonDataAttributes
} from "@/lib/billing/subscription-button-metadata";
import { PromoBanner } from "@/components/promo/promo-banner";

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
  analyticsContext?: MasteringAnalyticsContext;
};

function clearStoredAdaptiveCheckoutSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MASTERSOUCE_ADAPTIVE_CHECKOUT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function adaptiveExportAccessHeaders(billingEmail: string): HeadersInit {
  const trimmed = billingEmail.trim().toLowerCase();
  return {
    "Content-Type": "application/json",
    ...(trimmed ? { [MASTERSOUCE_BILLING_EMAIL_HEADER]: trimmed } : {})
  };
}

const ADAPTIVE_CHECKOUT_PLAN_ID = "creator_monthly" as const;

export function AdaptiveExportGate({
  jobId,
  fileId,
  pendingCheckoutSnapshot,
  onUnlocked,
  analyticsContext
}: AdaptiveExportGateProps) {
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

  useEffect(() => {
    trackMasteringFunnelEvent("mastering_export_gate_viewed", {
      source_component: "adaptive_export_gate",
      job_id: jobId,
      file_id: fileId,
      gate_reason: "adaptive_subscription_required"
    });
    trackMasteringFunnelEvent("mastering_subscription_cta_viewed", {
      source_component: "adaptive_export_gate",
      plan_id: ADAPTIVE_CHECKOUT_PLAN_ID
    });
  }, [jobId, fileId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter the billing email from Stripe checkout (the one on the receipt).");
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
        headers: adaptiveExportAccessHeaders(trimmed),
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
          "We still do not see an active paid plan on that billing email. If checkout just finished, wait a few seconds and tap “Already paid? Re-check access.” If you have not subscribed yet, continue to checkout — you will not be charged twice for the same plan."
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
      setError("Enter the billing email shown on your Stripe receipt.");
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
        headers: adaptiveExportAccessHeaders(trimmed),
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
          "Still no active plan on that email. If payment just cleared, wait a few seconds and tap “Already paid? Re-check access.” Otherwise continue to checkout to activate Creator or Pro Studio."
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
      setError("Add your billing email first so we can match it after checkout.");
      return;
    }
    setCheckoutLoading(true);
    setError(null);
    setInfo(null);
    trackMasteringFunnelEvent("mastering_checkout_started", {
      source_component: "adaptive_export_gate",
      plan_id: ADAPTIVE_CHECKOUT_PLAN_ID,
      job_id: jobId,
      file_id: fileId
    });
    try {
      sessionStorage.setItem(MASTERSOUCE_BILLING_EMAIL_KEY, trimmed);
      savePendingAdaptiveExport(pendingCheckoutSnapshot);

      const checkoutMetadata = getSubscriptionPlanMetadata(ADAPTIVE_CHECKOUT_PLAN_ID);
      const ga_client_id = await getGaClientId();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "subscription",
          planId: ADAPTIVE_CHECKOUT_PLAN_ID,
          planTier: checkoutMetadata.planTier,
          priceId: checkoutMetadata.priceId,
          email: trimmed,
          returnTo: buildAdaptiveCheckoutReturnTo(),
          intent: "adaptive",
          ...(ga_client_id ? { ga_client_id } : {})
        })
      });
      const payload = (await res.json()) as ExportAccessPayload;
      if (payload?.alreadyEntitled) {
        console.log("[ADAPTIVE_UI] checkout skipped: already entitled");
        const verify = await fetch("/api/adaptive/export-access", {
          method: "POST",
          headers: adaptiveExportAccessHeaders(trimmed),
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
  const adaptiveCheckoutMetadata = getSubscriptionPlanMetadata(ADAPTIVE_CHECKOUT_PLAN_ID);
  const adaptiveCheckoutDataAttrs = subscriptionButtonDataAttributes(adaptiveCheckoutMetadata);

  return (
    <section style={panelStyle}>
      <div style={iconStyle}>⬇</div>
      <h3 style={headingStyle}>Export adaptive master</h3>
      <p style={mutedText}>
        <strong style={{ color: "#e2e8ff" }}>Adaptive previews are already free.</strong>
        <br />
        Enter the billing email from your subscription so we can unlock the paid WAV export.
      </p>
      <PromoBanner href="/pricing" />
      <form onSubmit={handleSubmit} style={formStyle}>
        <label htmlFor="adaptive-billing-email" style={labelStyle}>
          Billing email (matches Stripe)
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
          placeholder="name@email-used-at-checkout.com"
          required
          style={inputStyle}
          autoComplete="email"
        />
        <button type="submit" disabled={busy} style={buttonStyle}>
          {loading ? "Checking…" : "Verify billing email & unlock export"}
        </button>
      </form>
      {!needsCheckoutPath ? (
        <p style={hintStyle}>
          No separate login — we match the email on your Stripe subscription. Use the exact receipt email, then tap verify.
        </p>
      ) : null}
      {needsCheckoutPath ? (
        <div style={checkoutActionsStyle}>
          {info ? <p style={infoStyle}>{info}</p> : null}
          <button
            type="button"
            data-analytics-id="ab-upgrade"
            data-analytics-version="mastered"
            {...adaptiveCheckoutDataAttrs}
            disabled={busy}
            style={buttonStyle}
            onClick={() => {
              trackAbEvent("ab_upgrade_clicked", {
                ...analyticsContext,
                version: "mastered",
                job_id: jobId,
                file_id: fileId
              });
              trackEvent("upgrade_clicked", {
                ...analyticsContext,
                version: "mastered",
                job_id: jobId,
                file_id: fileId,
                source_component: "ab_comparison",
                page_path: window.location.pathname
              });
              trackEvent("checkout_started", {
                ...analyticsContext,
                version: "mastered",
                job_id: jobId,
                file_id: fileId,
                source_component: "ab_comparison",
                page_path: window.location.pathname
              });
              trackSubscriptionButtonClick({
                metadata: adaptiveCheckoutMetadata,
                sourceComponent: "adaptive_export_gate"
              });
              trackMasteringFunnelEvent("mastering_subscription_cta_clicked", {
                source_component: "adaptive_export_gate",
                plan_id: ADAPTIVE_CHECKOUT_PLAN_ID,
                job_id: jobId,
                file_id: fileId
              });
              void handleContinueToCheckout();
            }}
          >
            {checkoutLoading ? "Starting checkout…" : "Continue to checkout for adaptive access"}
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
      <p style={privacyNoteStyle}>Used only to confirm your plan with Stripe — never for marketing.</p>
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
