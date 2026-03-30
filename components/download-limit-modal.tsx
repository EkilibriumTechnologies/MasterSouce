"use client";

import { useEffect, useRef } from "react";

type DownloadLimitModalProps = {
  open: boolean;
  onClose: () => void;
  onViewPlans: () => void;
};

export function DownloadLimitModal({ open, onClose, onViewPlans }: DownloadLimitModalProps) {
  const viewPlansRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    viewPlansRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-limit-title"
        aria-describedby="download-limit-description"
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" style={closeStyle} onClick={onClose} aria-label="Close dialog">
          ×
        </button>
        <p id="download-limit-title" style={titleStyle}>
          Download limit reached
        </p>
        <p id="download-limit-description" style={bodyStyle}>
          You&apos;ve used your free downloads for this month. Upgrade your plan to download more mastered tracks.
        </p>
        <div style={actionsStyle}>
          <button ref={viewPlansRef} type="button" style={primaryStyle} onClick={onViewPlans}>
            View plans
          </button>
          <button type="button" style={secondaryStyle} onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  display: "grid",
  placeItems: "center",
  padding: "20px",
  background: "rgba(4, 8, 18, 0.72)",
  backdropFilter: "blur(6px)"
};

const panelStyle: React.CSSProperties = {
  width: "min(460px, 100%)",
  borderRadius: "18px",
  border: "1px solid rgba(120, 200, 170, 0.28)",
  background: "linear-gradient(160deg, rgba(16, 28, 40, 0.96), rgba(10, 14, 26, 0.98))",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
  padding: "24px 22px 18px",
  position: "relative"
};

const closeStyle: React.CSSProperties = {
  position: "absolute",
  top: "10px",
  right: "10px",
  width: "32px",
  height: "32px",
  borderRadius: "999px",
  border: "1px solid rgba(120, 140, 180, 0.45)",
  background: "rgba(8, 12, 24, 0.7)",
  color: "#c6d4e8",
  cursor: "pointer",
  fontSize: "1.2rem",
  lineHeight: 1
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: "#e8fff4",
  fontWeight: 700,
  fontSize: "1.2rem",
  letterSpacing: "-0.02em"
};

const bodyStyle: React.CSSProperties = {
  margin: "12px 0 0",
  color: "#9fb8ae",
  fontSize: "0.95rem",
  lineHeight: 1.55
};

const actionsStyle: React.CSSProperties = {
  marginTop: "20px",
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  alignItems: "center"
};

const primaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  border: 0,
  padding: "10px 16px",
  fontWeight: 700,
  fontSize: "0.9rem",
  color: "#061a14",
  background: "linear-gradient(120deg, #2de39d, #5cdbb8)",
  cursor: "pointer"
};

const secondaryStyle: React.CSSProperties = {
  borderRadius: "10px",
  border: "1px solid rgba(120, 140, 180, 0.45)",
  background: "transparent",
  color: "#c6d4e8",
  padding: "9px 14px",
  fontSize: "0.85rem",
  cursor: "pointer"
};
