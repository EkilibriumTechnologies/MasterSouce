"use client";

import { useEffect, useState } from "react";

export function MobileMasterBanner() {
  const [isMobile, setIsMobile] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => {
      setCopied(false);
    }, 2000);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  if (!isMobile) return null;

  return (
    <div style={mobileBannerStyle}>
      <span>🎧 Works on mobile — or save the link to finish on desktop.</span>
      <button
        type="button"
        style={mobileBannerBtnStyle}
        onClick={() => {
          void navigator.clipboard.writeText("https://www.mastersauce.ai");
          setCopied(true);
        }}
      >
        {copied ? "Copied!" : "Save link"}
      </button>
    </div>
  );
}

const mobileBannerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  background: "rgba(143, 98, 255, 0.12)",
  border: "1px solid rgba(143, 98, 255, 0.3)",
  borderRadius: "12px",
  padding: "12px 16px",
  marginBottom: "16px",
  color: "#c4b8ff",
  fontSize: "0.9rem"
};

const mobileBannerBtnStyle: React.CSSProperties = {
  background: "rgba(143, 98, 255, 0.25)",
  border: "1px solid rgba(143, 98, 255, 0.5)",
  borderRadius: "8px",
  color: "#e0d9ff",
  fontWeight: 600,
  fontSize: "0.85rem",
  padding: "6px 14px",
  cursor: "pointer",
  whiteSpace: "nowrap"
};
