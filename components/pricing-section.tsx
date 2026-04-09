"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import { PlanId } from "@/lib/subscriptions/types";

const PLAN_ORDER: PlanId[] = ["free", "creator_monthly", "pro_studio_monthly"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CheckoutSelection = {
  kind: "subscription" | "credit_pack";
  planId?: PlanId;
};

type ModalMode = "checkout" | "manage";

export function PricingSection() {
  const searchParams = useSearchParams();
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selection, setSelection] = useState<CheckoutSelection | null>(null);
  const [billingEmail, setBillingEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const modalOpen = modalMode !== null;
  const adaptiveIntent = searchParams?.get("intent") === "adaptive";
  const returnTo = searchParams?.get("returnTo")?.trim() ?? "";
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

  useEffect(() => {
    if (!modalOpen) return;
    emailInputRef.current?.focus();
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        closeModal();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, isSubmitting]);

  function openCheckoutModal(nextSelection: CheckoutSelection) {
    setModalMode("checkout");
    setSelection(nextSelection);
    setBillingEmail("");
    setEmailError("");
    setCheckoutError("");
  }

  function openManageBillingModal() {
    setModalMode("manage");
    setSelection(null);
    setBillingEmail("");
    setEmailError("");
    setCheckoutError("");
  }

  function closeModal() {
    if (isSubmitting) return;
    setModalMode(null);
    setSelection(null);
    setEmailError("");
    setCheckoutError("");
  }

  async function startCheckout(nextSelection: CheckoutSelection, email: string) {
    const trimmed = email.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      throw new Error("invalid_billing_email");
    }
    const body =
      nextSelection.kind === "credit_pack"
        ? { kind: nextSelection.kind, email: trimmed, returnTo: safeReturnTo, intent: adaptiveIntent ? "adaptive" : undefined }
        : {
            kind: nextSelection.kind,
            planId: nextSelection.planId,
            email: trimmed,
            returnTo: safeReturnTo,
            intent: adaptiveIntent ? "adaptive" : undefined
          };
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = (await response.json()) as { url?: string; error?: string; message?: string };
    if (!response.ok || !payload.url) {
      if (payload.error === "invalid_billing_email") {
        throw new Error("invalid_billing_email");
      }
      throw new Error(payload.error ?? "Unable to start checkout right now.");
    }
    window.location.assign(payload.url);
  }

  async function startBillingPortal(email: string) {
    const trimmed = email.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      throw new Error("invalid_billing_email");
    }
    const response = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: trimmed })
    });
    const payload = (await response.json()) as { url?: string; error?: string; message?: string };
    if (!response.ok || !payload.url) {
      if (payload.error === "invalid_billing_email") throw new Error("invalid_billing_email");
      if (payload.error === "subscription_not_found") throw new Error("subscription_not_found");
      throw new Error(payload.error ?? "Unable to open billing portal right now.");
    }
    window.location.assign(payload.url);
  }

  async function submitCheckout() {
    if (modalMode !== "checkout" || !selection || isSubmitting) return;
    const trimmed = billingEmail.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      setCheckoutError("");
      return;
    }
    setEmailError("");
    setCheckoutError("");
    setIsSubmitting(true);
    try {
      await startCheckout(selection, trimmed);
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_billing_email") {
        setEmailError("Enter a valid email address.");
        setCheckoutError("");
        setIsSubmitting(false);
        return;
      }
      setCheckoutError("Something went wrong while preparing your checkout session. Please try again.");
      setIsSubmitting(false);
    }
  }

  async function submitManageBilling() {
    if (modalMode !== "manage" || isSubmitting) return;
    const trimmed = billingEmail.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      setCheckoutError("");
      return;
    }
    setEmailError("");
    setCheckoutError("");
    setIsSubmitting(true);
    try {
      await startBillingPortal(trimmed);
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_billing_email") {
        setEmailError("Enter a valid email address.");
        setCheckoutError("");
        setIsSubmitting(false);
        return;
      }
      if (error instanceof Error && error.message === "subscription_not_found") {
        setCheckoutError("We couldn’t find an active subscription for that email.");
        setIsSubmitting(false);
        return;
      }
      setCheckoutError("Something went wrong while opening billing management. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <section id="pricing" style={sectionStyle} aria-labelledby="pricing-title">
      <p style={eyebrowStyle}>Pricing</p>
      <h2 id="pricing-title" style={titleStyle}>
        Master like a studio. Pay like an indie.
      </h2>
      <p style={subtitleStyle}>Preview unlimited times. Only pay when you download.</p>
      {adaptiveIntent ? (
        <div style={adaptiveIntentBannerStyle}>
          <p style={adaptiveIntentTitleStyle}>Unlock Adaptive AI Mastering</p>
          <p style={adaptiveIntentBodyStyle}>
            Standard Mastering stays your base flow. Adaptive adds premium track analysis + your own sound direction prompt.
          </p>
        </div>
      ) : null}
      <div style={manageBillingRowStyle}>
        <span style={manageBillingHintStyle}>Already subscribed?</span>
        <button type="button" style={manageBillingLinkStyle} onClick={openManageBillingModal}>
          Manage billing
        </button>
      </div>
      <div style={gridStyle}>
        {PLAN_ORDER.map((planId) => {
          const plan = PLAN_DEFINITIONS[planId];
          const isFree = plan.id === "free";
          return (
            <article key={plan.id} style={plan.highlighted ? cardHighlightedStyle : cardStyle}>
              {plan.highlighted ? <p style={badgeStyle}>{plan.badgeLabel ?? "Most popular"}</p> : <p style={badgePlaceholderStyle}>&nbsp;</p>}
              <h3 style={planNameStyle}>{plan.name}</h3>
              <p style={priceStyle}>
                ${plan.monthlyPriceUsd}
                <span style={priceSuffixStyle}>/mo</span>
              </p>
              <p style={descriptionStyle}>{plan.description}</p>
              <ul style={featuresListStyle}>
                {plan.features.map((feature) => (
                  <li key={feature} style={featureItemStyle}>
                    {feature}
                  </li>
                ))}
              </ul>
              {isFree ? (
                <button type="button" disabled style={ctaNeutralStyle}>
                  {plan.ctaLabel}
                </button>
              ) : (
                <button
                  type="button"
                  style={ctaUpgradeStyle}
                  onClick={() => openCheckoutModal({ kind: "subscription", planId: plan.id })}
                >
                  {adaptiveIntent ? "Unlock Adaptive AI Mastering" : plan.ctaLabel}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <div style={creditPackStyle}>
        <p style={creditPackTitleStyle}>Credit Pack - $4 one-time</p>
        <p style={creditPackBodyStyle}>Adds 5 extra masters. Your monthly plan is always consumed first.</p>
        <button type="button" style={creditPackButtonStyle} onClick={() => openCheckoutModal({ kind: "credit_pack" })}>
          Get 5 masters for $4
        </button>
      </div>
      <div style={adaptiveCopyCardStyle}>
        <p style={adaptiveCopyTitleStyle}>Adaptive AI Mastering</p>
        <p style={adaptiveCopyBodyStyle}>
          Tailor your master with your own sound direction. Adaptive shapes the master from track analysis plus your prompt.
        </p>
        <p style={adaptiveCopySubtleStyle}>Standard Mastering remains included as the fast preset-based baseline.</p>
      </div>
      {modalOpen ? (
        <div style={backdropStyle} onClick={closeModal}>
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-modal-title"
            aria-describedby="checkout-modal-description"
            style={modalStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <p style={modalEyebrowStyle}>{modalMode === "manage" ? "Billing portal" : "Secure checkout"}</p>
            <h3 id="checkout-modal-title" style={modalTitleStyle}>
              {modalMode === "manage" ? "Manage your subscription" : "Continue to Stripe checkout"}
            </h3>
            <p id="checkout-modal-description" style={modalBodyStyle}>
              {modalMode === "manage" ? (
                "Enter the billing email linked to your subscription."
              ) : (
                <>
                  Enter the billing email you want linked to this purchase.
                  <br />
                  We&apos;ll use it for your plan or credit pack and send you securely to Stripe checkout next.
                </>
              )}
            </p>
            <label htmlFor="billing-email" style={modalLabelStyle}>
              Billing email
            </label>
            <input
              id="billing-email"
              ref={emailInputRef}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={billingEmail}
              disabled={isSubmitting}
              aria-invalid={Boolean(emailError)}
              aria-describedby={checkoutError ? "checkout-error" : emailError ? "email-error" : "checkout-helper"}
              onChange={(event) => {
                setBillingEmail(event.target.value);
                if (emailError) setEmailError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (modalMode === "manage") {
                    void submitManageBilling();
                  } else {
                    void submitCheckout();
                  }
                }
              }}
              style={emailInputStyle}
            />
            {emailError ? (
              <p id="email-error" style={fieldErrorStyle}>
                {emailError}
              </p>
            ) : (
              <p id="checkout-helper" style={helperTextStyle}>
                {modalMode === "manage"
                  ? "We'll use this email to find your active subscription."
                  : "Your purchase will be linked to this email."}
              </p>
            )}
            {checkoutError ? (
              <div id="checkout-error" style={checkoutErrorBoxStyle} role="alert">
                <p style={checkoutErrorTitleStyle}>
                  {modalMode === "manage" ? "Unable to open billing portal" : "Unable to start checkout"}
                </p>
                <p style={checkoutErrorBodyStyle}>{checkoutError}</p>
              </div>
            ) : null}
            <div style={actionsStyle}>
              <button type="button" style={secondaryButtonStyle} onClick={closeModal} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={() => (modalMode === "manage" ? void submitManageBilling() : void submitCheckout())}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? modalMode === "manage"
                    ? "Opening customer portal..."
                    : "Redirecting to secure checkout..."
                  : modalMode === "manage"
                    ? "Continue"
                    : "Continue to checkout"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.94), rgba(12, 17, 30, 0.94))",
  border: "1px solid rgba(142, 155, 209, 0.2)",
  borderRadius: "24px",
  boxShadow: "0 18px 40px rgba(2, 4, 12, 0.45)",
  padding: "32px 24px"
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#b7c4ff",
  fontSize: "0.74rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.16em",
  textAlign: "center"
};

const titleStyle: React.CSSProperties = {
  margin: "10px 0 0",
  fontSize: "clamp(1.9rem, 3.4vw, 2.9rem)",
  color: "#f1f4ff",
  textAlign: "center",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};

const subtitleStyle: React.CSSProperties = {
  margin: "8px auto 0",
  textAlign: "center",
  color: "#90a0cb",
  maxWidth: "740px"
};

const manageBillingRowStyle: React.CSSProperties = {
  marginTop: "14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  flexWrap: "wrap"
};

const manageBillingHintStyle: React.CSSProperties = {
  margin: 0,
  color: "#8ea0d0",
  fontSize: "0.9rem"
};

const manageBillingLinkStyle: React.CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#c8d6ff",
  fontWeight: 700,
  fontSize: "0.95rem",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  cursor: "pointer",
  padding: 0
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
  marginTop: "26px"
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(74, 90, 150, 0.32)",
  borderRadius: "18px",
  background: "linear-gradient(155deg, rgba(19, 28, 52, 0.62), rgba(12, 19, 37, 0.62))",
  padding: "18px",
  display: "grid",
  gap: "10px"
};

const cardHighlightedStyle: React.CSSProperties = {
  ...cardStyle,
  border: "1px solid rgba(151, 116, 255, 0.88)",
  boxShadow: "inset 0 0 0 1px rgba(151, 116, 255, 0.4), 0 10px 24px rgba(121, 100, 255, 0.24)"
};

const badgeStyle: React.CSSProperties = {
  margin: 0,
  color: "#d9cdff",
  fontSize: "0.74rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em"
};

const badgePlaceholderStyle: React.CSSProperties = { ...badgeStyle, opacity: 0 };
const planNameStyle: React.CSSProperties = { margin: 0, color: "#ecf1ff", fontWeight: 700, fontSize: "1.4rem" };

const priceStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: "#f1f5ff",
  fontWeight: 800,
  fontSize: "2.1rem",
  letterSpacing: "-0.02em"
};

const priceSuffixStyle: React.CSSProperties = { color: "#99a8d6", fontSize: "0.95rem", marginLeft: "3px", fontWeight: 600 };
const descriptionStyle: React.CSSProperties = { margin: 0, color: "#9ca8cc", lineHeight: 1.5, minHeight: "46px" };

const featuresListStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: "8px",
  color: "#ced8f9",
  fontSize: "0.9rem"
};

const featureItemStyle: React.CSSProperties = { lineHeight: 1.45 };

const ctaUpgradeStyle: React.CSSProperties = {
  marginTop: "4px",
  border: 0,
  borderRadius: "12px",
  background: "linear-gradient(125deg, #8b79ff 0%, #5e7dff 100%)",
  boxShadow: "0 10px 25px rgba(102, 121, 255, 0.34)",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: "0.94rem",
  padding: "12px 14px",
  cursor: "pointer"
};

const ctaNeutralStyle: React.CSSProperties = {
  marginTop: "4px",
  borderRadius: "12px",
  border: "1px solid rgba(120, 140, 180, 0.45)",
  background: "rgba(14, 22, 39, 0.9)",
  color: "#95a1c9",
  fontWeight: 700,
  fontSize: "0.94rem",
  padding: "12px 14px",
  cursor: "not-allowed"
};

const creditPackStyle: React.CSSProperties = {
  marginTop: "14px",
  border: "1px solid rgba(80, 182, 157, 0.4)",
  borderRadius: "16px",
  padding: "16px",
  background: "linear-gradient(160deg, rgba(12, 32, 34, 0.72), rgba(11, 24, 38, 0.74))"
};
const creditPackTitleStyle: React.CSSProperties = { margin: 0, color: "#defef1", fontWeight: 700 };
const creditPackBodyStyle: React.CSSProperties = { margin: "8px 0 0", color: "#9bc5ba", fontSize: "0.9rem" };
const creditPackButtonStyle: React.CSSProperties = {
  marginTop: "12px",
  border: 0,
  borderRadius: "11px",
  background: "linear-gradient(120deg, #2de39d, #5fe6ff)",
  color: "#072016",
  fontWeight: 700,
  padding: "10px 14px",
  cursor: "pointer"
};

const adaptiveIntentBannerStyle: React.CSSProperties = {
  marginTop: "14px",
  border: "1px solid rgba(151, 116, 255, 0.5)",
  borderRadius: "14px",
  padding: "12px 14px",
  background: "linear-gradient(145deg, rgba(34, 24, 60, 0.7), rgba(19, 22, 43, 0.7))"
};
const adaptiveIntentTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#e7ddff",
  fontWeight: 700
};
const adaptiveIntentBodyStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#b8b7e9",
  lineHeight: 1.5,
  fontSize: "0.92rem"
};
const adaptiveCopyCardStyle: React.CSSProperties = {
  marginTop: "14px",
  border: "1px solid rgba(109, 124, 194, 0.38)",
  borderRadius: "16px",
  padding: "16px",
  background: "linear-gradient(160deg, rgba(15, 22, 40, 0.74), rgba(12, 19, 35, 0.82))"
};
const adaptiveCopyTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#dbe5ff",
  fontWeight: 700
};
const adaptiveCopyBodyStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#a8b7e2",
  lineHeight: 1.55,
  fontSize: "0.92rem"
};
const adaptiveCopySubtleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#8fa3d6",
  fontSize: "0.84rem"
};

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 5, 14, 0.72)",
  backdropFilter: "blur(4px)",
  display: "grid",
  placeItems: "center",
  zIndex: 90,
  padding: "20px"
};

const modalStyle: React.CSSProperties = {
  width: "min(100%, 520px)",
  borderRadius: "20px",
  border: "1px solid rgba(146, 160, 220, 0.28)",
  background: "linear-gradient(160deg, rgba(20, 29, 51, 0.98), rgba(11, 18, 34, 0.98))",
  boxShadow: "0 30px 70px rgba(1, 5, 14, 0.55)",
  padding: "24px",
  color: "#eaf0ff"
};

const modalEyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#8de8cb",
  fontSize: "0.72rem",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  fontWeight: 700
};

const modalTitleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#f0f5ff",
  fontSize: "clamp(1.3rem, 2vw, 1.55rem)",
  lineHeight: 1.2
};

const modalBodyStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#aebce5",
  lineHeight: 1.55
};

const modalLabelStyle: React.CSSProperties = {
  display: "block",
  marginTop: "18px",
  marginBottom: "8px",
  fontWeight: 700,
  color: "#dae3ff"
};

const emailInputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  border: "1px solid rgba(134, 153, 212, 0.5)",
  background: "rgba(10, 17, 34, 0.94)",
  color: "#f3f7ff",
  fontSize: "1rem",
  padding: "12px 13px",
  outline: "none"
};

const helperTextStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#93a4d3",
  fontSize: "0.88rem"
};

const fieldErrorStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#ff9db2",
  fontSize: "0.88rem"
};

const checkoutErrorBoxStyle: React.CSSProperties = {
  marginTop: "14px",
  borderRadius: "12px",
  border: "1px solid rgba(251, 116, 146, 0.4)",
  background: "rgba(53, 20, 36, 0.55)",
  padding: "12px"
};

const checkoutErrorTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#ffdbe4",
  fontWeight: 700
};

const checkoutErrorBodyStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#ffc1d0",
  fontSize: "0.92rem"
};

const actionsStyle: React.CSSProperties = {
  marginTop: "18px",
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  flexWrap: "wrap"
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(136, 154, 212, 0.42)",
  borderRadius: "11px",
  background: "rgba(13, 21, 40, 0.9)",
  color: "#b4c3ec",
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const primaryButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: "11px",
  background: "linear-gradient(125deg, #8b79ff 0%, #5e7dff 100%)",
  color: "#ffffff",
  padding: "10px 14px",
  fontWeight: 700,
  boxShadow: "0 10px 24px rgba(95, 121, 255, 0.35)",
  cursor: "pointer"
};
