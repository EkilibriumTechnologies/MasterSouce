"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { trackEvent } from "@/lib/analytics/ab-comparison";
import {
  FATHERS_DAY_PROMO_CODE,
  isFathersDayPromoActive,
  recordFathersDayPopupDismissed,
  shouldShowFathersDayPopup
} from "@/lib/promo/fathers-day-2026";
import { isMastersourceWorkflowBusy, subscribeMastersourceWorkflowBusy } from "@/lib/promo/workflow-guard";

import { PromoCountdownTimer } from "./countdown-timer";

const POPUP_OPEN_DELAY_MS = 2500;

type FathersDayPopupProps = {
  pricingHref?: string;
};

export function FathersDayPopup({ pricingHref = "/pricing" }: FathersDayPopupProps) {
  const [open, setOpen] = useState(false);
  const [promoActive, setPromoActive] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const viewTrackedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPromoActive(isFathersDayPromoActive());
    return subscribeMastersourceWorkflowBusy(setWorkflowBusy);
  }, []);

  const dismiss = useCallback(() => {
    recordFathersDayPopupDismissed();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!promoActive || workflowBusy || !shouldShowFathersDayPopup()) return;

    const timer = window.setTimeout(() => {
      if (isMastersourceWorkflowBusy() || !shouldShowFathersDayPopup() || !isFathersDayPromoActive()) return;
      setOpen(true);
    }, POPUP_OPEN_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [promoActive, workflowBusy]);

  useEffect(() => {
    if (!open || viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    trackEvent("promo_popup_view", {
      source_component: "fathers_day_popup",
      page_path: window.location.pathname
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dismiss]);

  if (!promoActive || !open) return null;

  return (
    <div style={backdropStyle} onClick={dismiss}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fathers-day-promo-title"
        aria-describedby="fathers-day-promo-body"
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <p id="fathers-day-promo-title" style={titleStyle}>
          🎉 Father&apos;s Day Weekend Special
        </p>
        <p id="fathers-day-promo-body" style={bodyStyle}>
          Get 50% off any paid plan for the next 12 months using code{" "}
          <strong style={codeStyle}>{FATHERS_DAY_PROMO_CODE}</strong>
        </p>
        <p style={deadlineStyle}>Offer ends Jun 22 at 11:59 PM.</p>
        <PromoCountdownTimer compact onExpired={dismiss} />
        <div style={actionsStyle}>
          <Link
            href={pricingHref}
            style={primaryButtonStyle}
            onClick={() => {
              trackEvent("promo_popup_cta_click", {
                source_component: "fathers_day_popup",
                page_path: window.location.pathname
              });
              recordFathersDayPopupDismissed();
              setOpen(false);
            }}
          >
            Upgrade &amp; Save 50%
          </Link>
          <button type="button" style={secondaryButtonStyle} onClick={dismiss}>
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 85,
  display: "grid",
  placeItems: "center",
  padding: "20px",
  background: "rgba(4, 8, 18, 0.74)",
  backdropFilter: "blur(6px)"
};

const panelStyle: React.CSSProperties = {
  width: "min(480px, 100%)",
  borderRadius: "20px",
  border: "1px solid rgba(255, 168, 108, 0.38)",
  background: "linear-gradient(165deg, rgba(36, 24, 48, 0.97), rgba(14, 20, 38, 0.98))",
  boxShadow: "0 28px 70px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 220, 180, 0.08)",
  padding: "24px 22px 20px"
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: "#fff3e8",
  fontWeight: 800,
  fontSize: "clamp(1.15rem, 2.4vw, 1.45rem)",
  lineHeight: 1.25
};

const bodyStyle: React.CSSProperties = {
  margin: "12px 0 0",
  color: "#d8c8bc",
  fontSize: "0.96rem",
  lineHeight: 1.55
};

const deadlineStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#f0b890",
  fontSize: "0.88rem",
  fontWeight: 600
};

const codeStyle: React.CSSProperties = {
  color: "#ffe4a8",
  fontWeight: 800
};

const actionsStyle: React.CSSProperties = {
  marginTop: "18px",
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  alignItems: "center"
};

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  border: 0,
  padding: "11px 16px",
  fontWeight: 700,
  fontSize: "0.92rem",
  color: "#1a0f08",
  background: "linear-gradient(125deg, #ffb36b 0%, #ff8f5a 100%)",
  boxShadow: "0 10px 24px rgba(255, 140, 80, 0.32)",
  textDecoration: "none",
  cursor: "pointer"
};

const secondaryButtonStyle: React.CSSProperties = {
  borderRadius: "10px",
  border: "1px solid rgba(180, 160, 200, 0.42)",
  background: "transparent",
  color: "#d8cce8",
  padding: "10px 14px",
  fontSize: "0.88rem",
  fontWeight: 600,
  cursor: "pointer"
};
