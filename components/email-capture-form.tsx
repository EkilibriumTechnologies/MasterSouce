"use client";

import { FormEvent, useState } from "react";
import { readResponsePayload } from "@/lib/http/read-response-payload";

type EmailCaptureFormProps = {
  jobId: string;
  fileId: string;
  onUnlocked: (downloadUrl: string) => void;
};

export function EmailCaptureForm({ jobId, fileId, onUnlocked }: EmailCaptureFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Please enter a valid email.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, jobId, fileId })
      });

      const payload = await readResponsePayload(response);
      if (!response.ok) {
        const apiError = typeof payload?.error === "string" ? payload.error : null;
        throw new Error(apiError ?? "Unable to unlock final master.");
      }
      const downloadUrl = typeof payload?.downloadUrl === "string" ? payload.downloadUrl : null;
      if (!downloadUrl) {
        throw new Error("Unlock response was empty or invalid.");
      }
      onUnlocked(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={panelStyle}>
      <div style={iconStyle}>⬇</div>
      <h3 style={headingStyle}>Ready to Export?</h3>
      <p style={mutedText}>Enter your email to unlock your mastered track. We&apos;ll enable final master export instantly.</p>
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          style={inputStyle}
        />
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Unlocking..." : "Unlock Final Master"}
        </button>
      </form>
      <p style={privacyNoteStyle}>Your email is only used to unlock and deliver your final master. We respect your privacy.</p>
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
  fontSize: "clamp(2rem, 3.2vw, 2.7rem)",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};

const mutedText: React.CSSProperties = {
  color: "#a8b3d8",
  margin: "0 0 16px 0",
  lineHeight: 1.55,
  fontSize: "1rem"
};

const formStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px"
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
const privacyNoteStyle: React.CSSProperties = {
  margin: "12px 0 0",
  color: "#8e9ac0",
  fontSize: "0.84rem"
};

const errorStyle: React.CSSProperties = {
  color: "#ff8ba8",
  marginTop: "10px"
};
