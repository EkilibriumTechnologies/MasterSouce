"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { trackEvent } from "@/lib/analytics/ab-comparison";
import { trackMasteringFunnelEvent } from "@/lib/analytics/mastering-funnel";
import { trackSubscriptionButtonClick } from "@/lib/analytics/subscription-button";
import { getGaClientId } from "@/lib/analytics/gtag";
import { MASTERSOUCE_BILLING_EMAIL_KEY } from "@/lib/billing/client-key";
import {
  getSubscriptionPlanMetadata,
  subscriptionButtonDataAttributes,
  type PaidSubscriptionPlanId,
  type SubscriptionButtonMetadata
} from "@/lib/billing/subscription-button-metadata";
import {
  FATHERS_DAY_PROMO_CODE,
  formatFathersDayPromoPriceUsd,
  isFathersDayPromoActive
} from "@/lib/promo/fathers-day-2026";
import { PromoBanner } from "@/components/promo/promo-banner";
import { PromoCountdownTimer } from "@/components/promo/countdown-timer";
import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import { PlanId } from "@/lib/subscriptions/types";
import { formatMonthlyWavLimitLabel } from "@/lib/usage/download-quota-policy";

const PLAN_ORDER: PlanId[] = ["free", "creator_monthly", "pro_studio_monthly"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatSongArchitectBlueprintFeature(monthlyLimit: number): string {
  return `${monthlyLimit} Song Architect Blueprint${monthlyLimit === 1 ? "" : "s"} / Month`;
}

const PLAN_COPY: Record<
  PlanId,
  {
    positioning: string;
    features: (plan: (typeof PLAN_DEFINITIONS)[PlanId]) => string[];
    ctaLabel: string;
    valueCallout?: string;
    ctaHint?: string;
  }
> = {
  free: {
    positioning: "Hear the master before you spend — no card on file.",
    features: () => [
      "Unlimited MP3 downloads",
      "1 free WAV download",
      "WAV 16-bit",
      "All 7 genre presets",
      "No watermark",
      formatSongArchitectBlueprintFeature(PLAN_DEFINITIONS.free.songArchitectGenerationsPerMonth)
    ],
    ctaLabel: "Start free",
    ctaHint: "No card on file. Upgrade from checkout when you need more finals or adaptive exports."
  },
  creator_monthly: {
    positioning: "Weekly releases with room to iterate.",
    features: (plan) => [
      "Unlimited MP3 downloads",
      formatMonthlyWavLimitLabel(plan.monthlyMastersLimit),
      "WAV 24-bit",
      "Unlimited A/B previews (never counted)",
      "Adaptive customization + exports",
      "All 7 genre presets",
      formatSongArchitectBlueprintFeature(plan.songArchitectGenerationsPerMonth)
    ],
    ctaLabel: "Choose Creator",
    valueCallout: "Sweet spot for steady output",
    ctaHint: "Adds adaptive steering plus higher bit depth."
  },
  pro_studio_monthly: {
    positioning: "Studios, small labels, or anyone mastering in batches.",
    features: (plan) => [
      "Unlimited MP3 downloads",
      formatMonthlyWavLimitLabel(plan.monthlyMastersLimit),
      "WAV 32-bit float",
      "Unlimited A/B previews (never counted)",
      "Adaptive customization + exports",
      "Priority processing",
      formatSongArchitectBlueprintFeature(plan.songArchitectGenerationsPerMonth)
    ],
    ctaLabel: "Choose Pro Studio",
    ctaHint: "Unlimited WAV exports plus float format."
  }
};

const PRICING_FAQ_ITEMS = [
  {
    question: "What actually uses my monthly allowance?",
    answer: "Each finished, full-quality WAV download. Generating previews, switching genres, or A/B listening does not."
  },
  {
    question: "Do previews use my quota?",
    answer: "No. Preview as many masters as you like — the counter moves only when you export a final file."
  },
  {
    question: "Can I buy extra exports mid-month?",
    answer: "Yes. One-time credit packs add five more finals and stack after your plan allowance."
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. Manage or cancel inside the Stripe customer portal whenever you need."
  }
] as const;

type CheckoutSelection = {
  kind: "subscription" | "credit_pack";
  planId?: PaidSubscriptionPlanId;
  metadata?: SubscriptionButtonMetadata;
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
  const [promoActive, setPromoActive] = useState(() => isFathersDayPromoActive());
  const promoViewTrackedRef = useRef(false);
  const funnelViewTrackedRef = useRef(false);

  const modalOpen = modalMode !== null;
  const adaptiveIntent = searchParams?.get("intent") === "adaptive";
  const returnTo = searchParams?.get("returnTo")?.trim() ?? "";
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

  useEffect(() => {
    if (!promoActive || promoViewTrackedRef.current) return;
    promoViewTrackedRef.current = true;
    trackEvent("promo_pricing_view", {
      source_component: "pricing_section",
      page_path: window.location.pathname
    });
  }, [promoActive]);

  useEffect(() => {
    if (funnelViewTrackedRef.current) return;
    funnelViewTrackedRef.current = true;
    trackMasteringFunnelEvent("mastering_credit_pack_cta_viewed", {
      source_component: "pricing_section"
    });
    for (const planId of ["creator_monthly", "pro_studio_monthly"] as const) {
      trackMasteringFunnelEvent("mastering_subscription_cta_viewed", {
        source_component: "pricing_section",
        plan_id: planId
      });
    }
  }, []);

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
    if (nextSelection.kind === "subscription" && nextSelection.planId) {
      const metadata = getSubscriptionPlanMetadata(nextSelection.planId);
      trackSubscriptionButtonClick({
        metadata,
        sourceComponent: "pricing_section"
      });
      trackMasteringFunnelEvent("mastering_subscription_cta_clicked", {
        source_component: "pricing_section",
        plan_id: nextSelection.planId
      });
      setModalMode("checkout");
      setSelection({ ...nextSelection, metadata });
      setBillingEmail("");
      setEmailError("");
      setCheckoutError("");
      return;
    }
    if (nextSelection.kind === "credit_pack") {
      trackMasteringFunnelEvent("mastering_credit_pack_cta_clicked", {
        source_component: "pricing_section"
      });
    }
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
    if (nextSelection.kind === "subscription") {
      if (!nextSelection.planId || !nextSelection.metadata?.priceId) {
        throw new Error("Missing subscription plan metadata.");
      }
    }
    const ga_client_id = await getGaClientId();
    const body =
      nextSelection.kind === "credit_pack"
        ? {
            kind: nextSelection.kind,
            email: trimmed,
            returnTo: safeReturnTo,
            intent: adaptiveIntent ? "adaptive" : undefined,
            ...(ga_client_id ? { ga_client_id } : {})
          }
        : {
            kind: nextSelection.kind,
            planId: nextSelection.planId,
            planTier: nextSelection.metadata!.planTier,
            priceId: nextSelection.metadata!.priceId,
            email: trimmed,
            returnTo: safeReturnTo,
            intent: adaptiveIntent ? "adaptive" : undefined,
            ...(ga_client_id ? { ga_client_id } : {})
          };
    if (typeof window !== "undefined") {
      sessionStorage.setItem(MASTERSOUCE_BILLING_EMAIL_KEY, trimmed.toLowerCase());
    }
    trackMasteringFunnelEvent("mastering_checkout_started", {
      source_component: "pricing_section",
      plan_id: nextSelection.kind === "subscription" ? nextSelection.planId : "credit_pack"
    });
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = (await response.json()) as {
      url?: string;
      error?: string;
      message?: string;
      alreadyEntitled?: boolean;
    };
    if (response.ok && payload.alreadyEntitled) {
      console.log("[pricing] checkout skipped: already entitled");
      const next = new URL(safeReturnTo, window.location.href);
      next.searchParams.set("checkout", "success");
      if (adaptiveIntent) {
        next.searchParams.set("intent", "adaptive");
        next.searchParams.set("upgraded", "1");
      }
      window.location.assign(next.toString());
      return;
    }
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
        Clear plans. Pay for finished exports.
      </h2>
      <p style={subtitleStyle}>
        Free tier proves the sound with unlimited A/B previews. Paid tiers add higher export caps, adaptive customization,
        and deeper WAV formats — you are never charged for listening.
      </p>
      <div style={reassuranceBarStyle} aria-label="Pricing fairness highlights">
        <span style={reassuranceItemStyle}>Listen all you want</span>
        <span style={reassuranceDotStyle} aria-hidden="true">
          •
        </span>
        <span style={reassuranceItemStyle}>No watermark</span>
        <span style={reassuranceDotStyle} aria-hidden="true">
          •
        </span>
        <span style={reassuranceItemStyle}>Exports = finished WAVs only</span>
      </div>
      {adaptiveIntent ? (
        <div style={adaptiveIntentBannerStyle}>
          <p style={adaptiveIntentTitleStyle}>Finish adaptive checkout</p>
          <p style={adaptiveIntentBodyStyle}>
            Recommended masters stay on every plan. Creator and Pro Studio add adaptive customization — write a short note,
            preview free, then export with the billing email from Stripe.
          </p>
        </div>
      ) : null}
      {promoActive ? (
        <>
          <PromoBanner href="#pricing" />
          <PromoCountdownTimer onExpired={() => setPromoActive(false)} />
        </>
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
          const planCopy = PLAN_COPY[planId];
          const isFree = plan.id === "free";
          return (
            <article key={plan.id} style={plan.highlighted ? cardHighlightedStyle : cardStyle}>
              {plan.highlighted ? (
                <p style={badgeStyle}>{plan.badgeLabel ?? "Most Popular"}</p>
              ) : (
                <p style={badgePlaceholderStyle}>&nbsp;</p>
              )}
              <h3 style={planNameStyle}>{plan.name}</h3>
              {plan.id === "free" ? <p style={ctaHintStyle}>Test the workflow</p> : null}
              {plan.id === "creator_monthly" ? (
                <p style={ctaHintStyle}>Best for artists releasing regularly</p>
              ) : null}
              {plan.id === "pro_studio_monthly" ? (
                <p style={ctaHintStyle}>Best for producers, teams, and catalog work</p>
              ) : null}
              {!isFree && promoActive ? (
                <div style={promoPriceBlockStyle}>
                  <p style={promoBadgeStyle}>🔥 Father&apos;s Day Weekend — 50% Off</p>
                  <p style={originalPriceStyle}>
                    <span style={strikethroughStyle}>${plan.monthlyPriceUsd}/month</span>
                  </p>
                  <p style={promoPriceStyle}>
                    ${formatFathersDayPromoPriceUsd(plan.monthlyPriceUsd)}
                    <span style={priceSuffixStyle}>/month</span>
                  </p>
                  <p style={promoCodeHintStyle}>
                    Use code {FATHERS_DAY_PROMO_CODE} at checkout. Offer ends Jun 22 at 11:59 PM.
                  </p>
                </div>
              ) : (
                <p style={priceStyle}>
                  ${plan.monthlyPriceUsd}
                  <span style={priceSuffixStyle}>/mo</span>
                </p>
              )}
              {plan.id === "creator_monthly" ? (
                <p style={ctaHintStyle}>Less than the cost of one manual master revision.</p>
              ) : null}
              <p style={descriptionStyle}>{planCopy.positioning}</p>
              {planCopy.valueCallout ? <p style={valueCalloutStyle}>{planCopy.valueCallout}</p> : null}
              <ul style={featuresListStyle}>
                {planCopy.features(plan).map((feature) => (
                  <li key={feature} style={featureItemStyle}>
                    {feature}
                  </li>
                ))}
              </ul>
              {isFree ? (
                <button type="button" disabled style={ctaNeutralStyle}>
                  {planCopy.ctaLabel}
                </button>
              ) : (
                (() => {
                  const subscriptionMetadata = getSubscriptionPlanMetadata(plan.id as PaidSubscriptionPlanId);
                  const subscriptionDataAttrs = subscriptionButtonDataAttributes(subscriptionMetadata);
                  return (
                    <button
                      type="button"
                      style={plan.highlighted ? ctaUpgradeStyle : ctaPaidSecondaryStyle}
                      {...subscriptionDataAttrs}
                      onClick={() =>
                        openCheckoutModal({
                          kind: "subscription",
                          planId: plan.id as PaidSubscriptionPlanId,
                          metadata: subscriptionMetadata
                        })
                      }
                    >
                      {adaptiveIntent ? "Continue to checkout" : planCopy.ctaLabel}
                    </button>
                  );
                })()
              )}
              {planCopy.ctaHint ? <p style={ctaHintStyle}>{planCopy.ctaHint}</p> : null}
            </article>
          );
        })}
      </div>
      <div style={creditPackStyle}>
        <p style={creditPackEyebrowStyle}>Need more finals this month?</p>
        <p style={creditPackTitleStyle}>Credit pack — $4 one-time</p>
        <p style={creditPackBodyStyle}>Adds five more full WAV exports. We always use your plan allowance before touching credits.</p>
        <button type="button" style={creditPackButtonStyle} onClick={() => openCheckoutModal({ kind: "credit_pack" })}>
          Add credit pack
        </button>
      </div>
      <div style={pricingFaqStyle}>
        {PRICING_FAQ_ITEMS.map((item) => (
          <details key={item.question} style={pricingFaqItemStyle}>
            <summary style={pricingFaqQuestionStyle}>{item.question}</summary>
            <p style={pricingFaqAnswerStyle}>{item.answer}</p>
          </details>
        ))}
      </div>
      <div style={adaptiveCopyCardStyle}>
        <p style={adaptiveCopyTitleStyle}>Adaptive customization</p>
        <p style={adaptiveCopyBodyStyle}>
          Add a short written brief and the engine reshapes loudness, tone, and punch around your mix — still previewed with
          the same A/B player before you spend an export.
        </p>
        <p style={adaptiveCopySubtleStyle}>
          Recommended masters remain the fast default on every plan; adaptive is an optional layer when you want hands-on
          direction without building a plugin chain.
        </p>
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
                "Type the email printed on your Stripe invoices so we can pull up the right subscription."
              ) : (
                <>
                  Use the inbox you want on Stripe receipts — it becomes the key we match for adaptive exports and billing
                  support.
                  <br />
                  Next step sends you straight into secure Stripe checkout.
                </>
              )}
            </p>
            <label htmlFor="billing-email" style={modalLabelStyle}>
              Billing email (Stripe receipt)
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
                  ? "Must match the email on your active subscription."
                  : adaptiveIntent
                    ? "Use the same email you will enter in Export adaptive master after checkout."
                    : "Shown on Stripe receipts — also how we reference your subscription if you need help."}
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
                {...(selection?.kind === "subscription" && selection.metadata
                  ? subscriptionButtonDataAttributes(selection.metadata)
                  : {})}
                onClick={() => {
                  if (modalMode === "manage") {
                    void submitManageBilling();
                    return;
                  }
                  if (selection?.kind === "subscription" && selection.metadata) {
                    trackSubscriptionButtonClick({
                      metadata: selection.metadata,
                      sourceComponent: "pricing_checkout_modal"
                    });
                  }
                  void submitCheckout();
                }}
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

const reassuranceBarStyle: React.CSSProperties = {
  margin: "14px auto 0",
  border: "1px solid rgba(126, 141, 199, 0.35)",
  borderRadius: "999px",
  background: "rgba(15, 22, 41, 0.68)",
  padding: "8px 14px",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  maxWidth: "760px"
};

const reassuranceItemStyle: React.CSSProperties = {
  color: "#c2cef2",
  fontSize: "0.82rem",
  lineHeight: 1.4
};

const reassuranceDotStyle: React.CSSProperties = {
  color: "#7184bb",
  fontSize: "0.78rem"
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
  padding: "20px",
  display: "grid",
  gap: "12px"
};

const cardHighlightedStyle: React.CSSProperties = {
  ...cardStyle,
  border: "1px solid rgba(151, 116, 255, 0.88)",
  transform: "translateY(-3px)",
  boxShadow: "inset 0 0 0 1px rgba(151, 116, 255, 0.36), 0 16px 32px rgba(121, 100, 255, 0.26)"
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

const promoPriceBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px"
};

const promoBadgeStyle: React.CSSProperties = {
  margin: 0,
  width: "fit-content",
  borderRadius: "999px",
  border: "1px solid rgba(255, 168, 108, 0.5)",
  background: "rgba(72, 38, 22, 0.55)",
  color: "#ffd8b8",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  padding: "5px 10px"
};

const originalPriceStyle: React.CSSProperties = {
  margin: 0,
  color: "#8a98c4",
  fontSize: "0.95rem"
};

const strikethroughStyle: React.CSSProperties = {
  textDecoration: "line-through",
  textDecorationColor: "rgba(180, 190, 220, 0.75)"
};

const promoPriceStyle: React.CSSProperties = {
  margin: 0,
  color: "#ffe8cc",
  fontWeight: 800,
  fontSize: "2.1rem",
  letterSpacing: "-0.02em"
};

const promoCodeHintStyle: React.CSSProperties = {
  margin: 0,
  color: "#c8b8a8",
  fontSize: "0.78rem",
  lineHeight: 1.45
};
const descriptionStyle: React.CSSProperties = { margin: 0, color: "#9ca8cc", lineHeight: 1.5, minHeight: "46px" };
const valueCalloutStyle: React.CSSProperties = {
  margin: "-2px 0 0",
  border: "1px solid rgba(151, 116, 255, 0.5)",
  borderRadius: "999px",
  color: "#decfff",
  background: "rgba(74, 47, 134, 0.35)",
  fontWeight: 700,
  fontSize: "0.78rem",
  letterSpacing: "0.02em",
  width: "fit-content",
  padding: "5px 9px"
};

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

const ctaPaidSecondaryStyle: React.CSSProperties = {
  marginTop: "4px",
  borderRadius: "12px",
  border: "1px solid rgba(134, 154, 214, 0.5)",
  background: "rgba(16, 25, 46, 0.9)",
  color: "#dee8ff",
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

const ctaHintStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: "#8fa2d7",
  fontSize: "0.8rem",
  lineHeight: 1.4
};

const creditPackStyle: React.CSSProperties = {
  marginTop: "18px",
  border: "1px solid rgba(101, 120, 186, 0.36)",
  borderRadius: "16px",
  padding: "16px",
  background: "linear-gradient(160deg, rgba(12, 22, 39, 0.72), rgba(10, 18, 32, 0.82))"
};
const creditPackEyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#a8b8e5",
  fontSize: "0.82rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em"
};
const creditPackTitleStyle: React.CSSProperties = { margin: "6px 0 0", color: "#def1ff", fontWeight: 700 };
const creditPackBodyStyle: React.CSSProperties = { margin: "8px 0 0", color: "#a6b6dc", fontSize: "0.9rem" };
const creditPackButtonStyle: React.CSSProperties = {
  marginTop: "12px",
  border: "1px solid rgba(131, 149, 206, 0.5)",
  borderRadius: "11px",
  background: "rgba(19, 31, 57, 0.9)",
  color: "#e4ecff",
  fontWeight: 700,
  padding: "10px 14px",
  cursor: "pointer"
};

const pricingFaqStyle: React.CSSProperties = {
  marginTop: "16px",
  display: "grid",
  gap: "10px"
};

const pricingFaqItemStyle: React.CSSProperties = {
  border: "1px solid rgba(90, 109, 166, 0.32)",
  borderRadius: "12px",
  background: "rgba(12, 19, 36, 0.64)",
  padding: "10px 12px"
};

const pricingFaqQuestionStyle: React.CSSProperties = {
  cursor: "pointer",
  color: "#dce6ff",
  fontWeight: 600,
  fontSize: "0.92rem",
  listStyle: "none"
};

const pricingFaqAnswerStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#a5b4dc",
  fontSize: "0.88rem",
  lineHeight: 1.5
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
