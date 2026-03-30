"use client";

import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import { PlanId } from "@/lib/subscriptions/types";

const PLAN_ORDER: PlanId[] = ["free", "creator_monthly", "pro_studio_monthly"];

export function PricingSection() {
  async function startCheckout(kind: "subscription" | "credit_pack", planId?: PlanId) {
    const email = typeof window !== "undefined" ? window.prompt("Enter your billing email")?.trim() : "";
    const body =
      kind === "credit_pack" ? { kind, ...(email ? { email } : {}) } : { kind, planId, ...(email ? { email } : {}) };
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !payload.url) {
      window.alert(payload.error ?? "Unable to start checkout right now.");
      return;
    }
    window.location.assign(payload.url);
  }

  return (
    <section id="pricing" style={sectionStyle} aria-labelledby="pricing-title">
      <p style={eyebrowStyle}>Pricing</p>
      <h2 id="pricing-title" style={titleStyle}>
        Master like a studio. Pay like an indie.
      </h2>
      <p style={subtitleStyle}>Preview unlimited times. Only pay when you download.</p>
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
                  onClick={() => void startCheckout("subscription", plan.id)}
                >
                  {plan.ctaLabel}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <div style={creditPackStyle}>
        <p style={creditPackTitleStyle}>Credit Pack - $4 one-time</p>
        <p style={creditPackBodyStyle}>Adds 5 extra masters. Your monthly plan is always consumed first.</p>
        <button type="button" style={creditPackButtonStyle} onClick={() => void startCheckout("credit_pack")}>
          Get 5 masters for $4
        </button>
      </div>
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
