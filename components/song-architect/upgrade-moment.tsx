"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { trackSongArchitectFunnelEvent } from "@/lib/song-architect/analytics";
import type { PlanId } from "@/lib/subscriptions/types";

type PostSuccessUpgradeCtaProps = {
  planId: PlanId;
  remaining: number;
};

export function PostSuccessUpgradeCta({ planId, remaining }: PostSuccessUpgradeCtaProps) {
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackSongArchitectFunnelEvent("free_tool_upgrade_cta_viewed", { plan_id: planId });
  }, [planId]);

  function handleUpgradeClick() {
    trackSongArchitectFunnelEvent("free_tool_upgrade_cta_clicked", { plan_id: planId });
  }

  return (
    <section style={bannerStyle} aria-label="Upgrade to unlock advanced Song Architect output">
      <p style={eyebrowStyle}>Blueprint ready</p>
      <h3 style={titleStyle}>Unlock the full producer toolkit</h3>
      <p style={bodyStyle}>
        Your free blueprint is below — concept, style prompt, and lyrics. Upgrade to Creator for mastering-ready prompts,
        alternate style directions, reference-artist guidance, and the full Suno/Udio export pack.
      </p>
      {remaining <= 1 ? (
        <p style={urgencyStyle}>
          {remaining === 0
            ? "You’ve used all free blueprints this month."
            : `${remaining} free blueprint left this month.`}
        </p>
      ) : null}
      <div style={actionsStyle}>
        <Link href="/pricing" style={primaryLinkStyle} onClick={handleUpgradeClick}>
          Upgrade to Creator →
        </Link>
        <span style={hintStyle}>Keep your free result — premium unlocks on your next generation after checkout.</span>
      </div>
    </section>
  );
}

const bannerStyle: React.CSSProperties = {
  border: "1px solid rgba(141, 232, 203, 0.35)",
  borderRadius: "14px",
  background: "linear-gradient(145deg, rgba(16, 36, 32, 0.92), rgba(12, 22, 38, 0.92))",
  padding: "14px",
  boxShadow: "0 12px 28px rgba(2, 8, 12, 0.35)"
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#8de8cb",
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em"
};

const titleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#f0f5ff",
  fontSize: "1.05rem",
  lineHeight: 1.25
};

const bodyStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#aebce5",
  fontSize: "0.86rem",
  lineHeight: 1.55
};

const urgencyStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#ffd4b1",
  fontSize: "0.82rem",
  fontWeight: 600
};

const actionsStyle: React.CSSProperties = {
  marginTop: "12px",
  display: "grid",
  gap: "8px"
};

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  color: "#fff",
  fontWeight: 700,
  padding: "10px 16px",
  textDecoration: "none",
  width: "fit-content",
  boxShadow: "0 10px 24px rgba(95, 121, 255, 0.32)"
};

const hintStyle: React.CSSProperties = {
  color: "#8fa0cf",
  fontSize: "0.76rem",
  lineHeight: 1.45
};

const lockedPanelStyle: React.CSSProperties = {
  border: "1px dashed rgba(141, 232, 203, 0.35)",
  borderRadius: "12px",
  padding: "12px",
  background: "rgba(8, 14, 28, 0.55)"
};

const lockedTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#8de8cb",
  fontWeight: 700,
  fontSize: "0.82rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em"
};

const lockedListStyle: React.CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: "18px",
  color: "#9fb0dc",
  fontSize: "0.84rem",
  lineHeight: 1.5
};

const lockedLinkStyle: React.CSSProperties = {
  color: "#8de8cb",
  fontWeight: 600,
  textDecoration: "underline"
};

export function PremiumLockedPanel({ onUpgradeClick }: { onUpgradeClick?: () => void }) {
  return (
    <div style={lockedPanelStyle} aria-label="Premium Song Architect features locked">
      <p style={lockedTitleStyle}>Creator-only advanced output</p>
      <ul style={lockedListStyle}>
        <li>Mastering-ready prompt for MasterSauce</li>
        <li>3 alternate style directions</li>
        <li>Reference artist / sound guidance</li>
        <li>Full Suno/Udio export + mastering checklist</li>
        <li>Quality diagnostics and alt hooks</li>
      </ul>
      <p style={{ ...bodyStyle, marginTop: "10px" }}>
        <Link href="/pricing" style={lockedLinkStyle} onClick={onUpgradeClick}>
          Upgrade to unlock →
        </Link>
      </p>
    </div>
  );
}
