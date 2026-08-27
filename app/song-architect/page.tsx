"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import "@/components/brand/mastersauce-brand-header.css";
import "./song-architect-form.css";
import { MASTERSOUCE_BILLING_EMAIL_HEADER, MASTERSOUCE_BILLING_EMAIL_KEY } from "@/lib/billing/client-key";
import { trackSongArchitectFunnelEvent } from "@/lib/song-architect/analytics";
import type { SongArchitectClientPayload } from "@/lib/song-architect/premium-output";
import { SONG_ARCHITECT_PRESETS } from "@/lib/song-architect/presets";
import { formatReferenceDNAPlainText } from "@/lib/song-architect/reference-dna";
import { formatHarmonyDNAPlainText, listFilledHarmonyFields } from "@/lib/song-architect/harmony-dna";
import { formatProductionMapPlainText } from "@/lib/song-architect/arrangement-dna";
import { formatSongDNAPlainText, listFilledSonicFields } from "@/lib/song-architect/song-dna";
import { formatSonicExclusionsPlainText, hasSonicExclusions } from "@/lib/song-architect/sonic-exclusions";
import { SONG_LENGTH_UI_OPTIONS } from "@/lib/song-architect/song-length";
import type {
  SongArchitectInput,
  SongArchitectPremiumEnhancements,
  SongArchitectSongLength,
  SongDNA
} from "@/lib/song-architect/types";
import { GenerationMatchPanel } from "@/components/song-architect/generation-match-panel";
import { MyReferencesPanel } from "@/components/song-architect/my-references-panel";
import { PostSuccessUpgradeCta, PremiumLockedPanel } from "@/components/song-architect/upgrade-moment";
import {
  ReferenceTrackPanel,
  type ReferenceTrackResult
} from "@/components/song-architect/reference-track-panel";
import type { ReferenceStyleBlueprint } from "@/lib/song-architect/reference-style-blueprint";

type FormState = {
  preset: string;
  songLength: SongArchitectSongLength;
  genre: string;
  theme: string;
  angle: string;
  emotion: string;
  hookIdentity: string;
  structure: string;
  energyCurve: string;
  language: string;
  vocalStyle: string;
  lineDensity: "sparse" | "balanced" | "dense";
  referenceArtists: string;
  mustInclude: string;
  avoidWords: string;
  userNotes: string;
  bpm: string;
  groove: string;
  instrumentFocus: string;
  productionEra: string;
  productionTexture: string;
};

type SongArchitectUsage = {
  used: number;
  limit: number;
  remaining: number;
  planId: string;
  entitled: boolean;
};

type SongArchitectGenerateResponse = {
  ok: boolean;
  data?: SongArchitectClientPayload;
  usage?: SongArchitectUsage;
  code?: string;
  message?: string;
};

function getPlanDisplayName(planId: string): string {
  if (planId === "creator_monthly") return "Creator";
  if (planId === "pro_studio_monthly") return "Pro Studio";
  return "Free";
}

function getUsageMessage(usage: SongArchitectUsage): string {
  if (usage.remaining <= 0) {
    return `${usage.remaining} of ${usage.limit} remaining - Upgrade for more`;
  }
  return `${usage.remaining} of ${usage.limit} blueprints remaining this month`;
}

const defaultFormState: FormState = {
  preset: "",
  songLength: "standard",
  genre: "",
  theme: "",
  angle: "",
  emotion: "",
  hookIdentity: "",
  structure: "",
  energyCurve: "",
  language: "English",
  vocalStyle: "",
  lineDensity: "balanced",
  referenceArtists: "",
  mustInclude: "",
  avoidWords: "",
  userNotes: "",
  bpm: "",
  groove: "",
  instrumentFocus: "",
  productionEra: "",
  productionTexture: ""
};

function csvToList(value: string): string[] | undefined {
  const parsed = value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

function parseOptionalBpm(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "auto") return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  const bpm = Math.round(parsed);
  if (bpm < 40 || bpm > 240) return undefined;
  return bpm;
}

function toPayload(form: FormState, referenceStyleBlueprint?: ReferenceStyleBlueprint): SongArchitectInput {
  const sonicControls = {
    ...(parseOptionalBpm(form.bpm) !== undefined ? { bpm: parseOptionalBpm(form.bpm) } : {}),
    ...(form.groove.trim() ? { groove: form.groove.trim() } : {}),
    ...(form.instrumentFocus.trim() ? { instrumentFocus: form.instrumentFocus.trim() } : {}),
    ...(form.productionEra.trim() ? { productionEra: form.productionEra.trim() } : {}),
    ...(form.productionTexture.trim() ? { productionTexture: form.productionTexture.trim() } : {})
  };

  return {
    preset: form.preset || undefined,
    songLength: form.songLength,
    genre: form.genre.trim() || undefined,
    theme: form.theme.trim() || undefined,
    angle: form.angle.trim() || undefined,
    emotion: form.emotion.trim() || undefined,
    hookIdentity: form.hookIdentity.trim() || undefined,
    structure: form.structure.trim() || undefined,
    energyCurve: form.energyCurve.trim() || undefined,
    language: form.language.trim() || undefined,
    vocalStyle: form.vocalStyle.trim() || undefined,
    lineDensity: form.lineDensity,
    referenceArtists: csvToList(form.referenceArtists),
    mustInclude: csvToList(form.mustInclude),
    avoidWords: csvToList(form.avoidWords),
    userNotes: form.userNotes.trim() || undefined,
    ...(Object.keys(sonicControls).length > 0 ? { sonicControls } : {}),
    ...(referenceStyleBlueprint ? { referenceStyleBlueprint } : {})
  };
}

async function copyToClipboard(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document !== "undefined") {
    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    return;
  }

  throw new Error("Clipboard is unavailable.");
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  async function handleCopy() {
    if (!value.trim()) return;
    setIsBusy(true);
    try {
      await copyToClipboard(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <button type="button" onClick={handleCopy} disabled={isBusy || !value.trim()} style={copyButtonStyle} aria-live="polite">
      {copied ? "Copied ✓" : label}
    </button>
  );
}

function PremiumOutputSections({ premium }: { premium: SongArchitectPremiumEnhancements }) {
  return (
    <>
      <div style={conceptCardStyle}>
        <p style={outputHeadingStyle}>Diagnostics</p>
        {Object.entries(premium.diagnostics).map(([key, value]) => (
          <div key={key} style={metricRowStyle}>
            <span style={metricKeyStyle}>{key}</span>
            <span style={metricValueStyle}>{Math.round(value)}</span>
          </div>
        ))}
      </div>

      <div style={conceptCardStyle}>
        <div style={outputCardHeaderStyle}>
          <p style={outputHeadingStyle}>Alternate Style Directions</p>
          <CopyButton label="Copy Directions" value={premium.styleDirections.join("\n")} />
        </div>
        <ol style={outputListStyle}>
          {premium.styleDirections.map((direction) => (
            <li key={direction}>{direction}</li>
          ))}
        </ol>
      </div>

      <div style={conceptCardStyle}>
        <div style={outputCardHeaderStyle}>
          <p style={outputHeadingStyle}>Reference Artist Guidance</p>
          <CopyButton label="Copy Guidance" value={premium.referenceArtistGuidance} />
        </div>
        <p style={outputLineStyle}>{premium.referenceArtistGuidance}</p>
      </div>

      <div style={conceptCardStyle}>
        <div style={outputCardHeaderStyle}>
          <p style={outputHeadingStyle}>Alt Hooks</p>
          <CopyButton label="Copy Hooks" value={premium.altHooks.join("\n")} />
        </div>
        <ul style={outputListStyle}>
          {premium.altHooks.map((hook) => (
            <li key={hook}>{hook}</li>
          ))}
        </ul>
      </div>

      <div style={conceptCardStyle}>
        <div style={outputCardHeaderStyle}>
          <p style={outputHeadingStyle}>Performance Notes</p>
          <CopyButton label="Copy Notes" value={premium.performanceNotes.join("\n")} />
        </div>
        <ul style={outputListStyle}>
          {premium.performanceNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <div style={conceptCardStyle}>
        <div style={outputCardHeaderStyle}>
          <p style={outputHeadingStyle}>Mastering-Ready Prompt</p>
          <CopyButton label="Copy Mastering Prompt" value={premium.masteringReadyPrompt} />
        </div>
        <pre style={lyricsStyle}>{premium.masteringReadyPrompt}</pre>
      </div>

      <div style={conceptCardStyle}>
        <div style={outputCardHeaderStyle}>
          <p style={outputHeadingStyle}>Export + Mastering Guidance</p>
          <CopyButton label="Copy Guidance" value={premium.exportMasteringGuidance} />
        </div>
        <pre style={lyricsStyle}>{premium.exportMasteringGuidance}</pre>
      </div>

      <div style={conceptCardStyle}>
        <div style={outputCardHeaderStyle}>
          <p style={outputHeadingStyle}>Suno/Udio Export Prompt</p>
          <CopyButton label="Copy Prompt" value={premium.exportPrompt} />
        </div>
        <textarea style={readonlyTextareaStyle} value={premium.exportPrompt} readOnly />
      </div>
    </>
  );
}

function SongDNAOutputCard({ songDNA }: { songDNA: SongDNA }) {
  const sonicRows = listFilledSonicFields(songDNA.sonic).filter(([key]) => key !== "emotionalSonicExpression");
  const harmonyRows = songDNA.harmony ? listFilledHarmonyFields(songDNA.harmony).slice(0, 8) : [];
  return (
    <div style={conceptCardStyle}>
      <div style={outputCardHeaderStyle}>
        <p style={outputHeadingStyle}>Song DNA</p>
        <CopyButton label="Copy Song DNA" value={formatSongDNAPlainText(songDNA)} />
      </div>
      <p style={outputLineStyle}>
        <strong style={outputKeyStyle}>Emotional intent:</strong> {songDNA.composition.emotionalIntent}
      </p>
      <p style={outputLineStyle}>
        <strong style={outputKeyStyle}>Sonic expression:</strong>{" "}
        {songDNA.sonic.emotionalSonicExpression ?? "Inferred from emotional intent"}
      </p>
      <p style={outputLineStyle}>
        <strong style={outputKeyStyle}>Perspective:</strong> {songDNA.composition.lyricalPerspective}
      </p>
      <p style={outputLineStyle}>
        <strong style={outputKeyStyle}>Runtime:</strong> {songDNA.composition.runtime}
      </p>
      {sonicRows.slice(0, 6).map(([key, value]) => (
        <p key={key} style={outputLineStyle}>
          <strong style={outputKeyStyle}>{key}:</strong> {value}
        </p>
      ))}

      <details style={dnaDetailsStyle}>
        <summary style={dnaSummaryStyle}>Sonic DNA</summary>
        {sonicRows.map(([key, value]) => (
          <p key={`sonic-${key}`} style={outputLineStyle}>
            <strong style={outputKeyStyle}>{key}:</strong> {value}
          </p>
        ))}
      </details>

      {songDNA.reference ? (
        <details style={dnaDetailsStyle}>
          <summary style={dnaSummaryStyle}>Reference DNA</summary>
          <p style={outputLineStyle}>{songDNA.reference.influenceSummary}</p>
          <CopyButton label="Copy Reference DNA" value={formatReferenceDNAPlainText(songDNA.reference)} />
        </details>
      ) : null}

      {songDNA.harmony ? (
        <details style={dnaDetailsStyle}>
          <summary style={dnaSummaryStyle}>Harmony DNA</summary>
          {harmonyRows.map(([key, value]) => (
            <p key={`harmony-${key}`} style={outputLineStyle}>
              <strong style={outputKeyStyle}>{key}:</strong> {value}
            </p>
          ))}
          <CopyButton label="Copy Harmony DNA" value={formatHarmonyDNAPlainText(songDNA.harmony)} />
        </details>
      ) : null}

      {hasSonicExclusions(songDNA.sonicExclusions) && songDNA.sonicExclusions ? (
        <details style={dnaDetailsStyle}>
          <summary style={dnaSummaryStyle}>Sonic Exclusions</summary>
          <pre style={lyricsStyle}>{formatSonicExclusionsPlainText(songDNA.sonicExclusions)}</pre>
        </details>
      ) : null}

      {songDNA.arrangement ? (
        <details style={dnaDetailsStyle}>
          <summary style={dnaSummaryStyle}>Production Map</summary>
          {songDNA.arrangement.globalArc ? (
            <p style={outputLineStyle}>
              <strong style={outputKeyStyle}>Arc:</strong> {songDNA.arrangement.globalArc}
            </p>
          ) : null}
          {songDNA.arrangement.sections.map((section) => (
            <div key={section.id} style={{ marginTop: "8px" }}>
              <p style={outputLineStyle}>
                <strong style={outputKeyStyle}>{section.label.toUpperCase()}</strong>
              </p>
              {section.energy !== undefined ? (
                <p style={outputLineStyle}>Energy: {section.energy}/10</p>
              ) : null}
              {section.vocalDirection ? <p style={outputLineStyle}>Vocals: {section.vocalDirection}</p> : null}
              {section.drumDirection ? <p style={outputLineStyle}>Drums: {section.drumDirection}</p> : null}
              {section.density ? <p style={outputLineStyle}>Arrangement: {section.density}</p> : null}
              {section.transitionIntoNext ? (
                <p style={outputLineStyle}>Transition: {section.transitionIntoNext}</p>
              ) : null}
            </div>
          ))}
          <CopyButton label="Copy Production Map" value={formatProductionMapPlainText(songDNA.arrangement)} />
        </details>
      ) : null}
    </div>
  );
}

const songLengthSectionStyle: React.CSSProperties = {
  marginTop: "14px",
  padding: "12px",
  borderRadius: "14px",
  border: "1px solid rgba(118, 136, 210, 0.35)",
  background: "linear-gradient(155deg, rgba(18, 26, 48, 0.95), rgba(10, 16, 32, 0.88))",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)"
};

const songLengthHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "10px"
};

const songLengthHeadingStyle: React.CSSProperties = {
  margin: 0,
  color: "#e8edff",
  fontWeight: 700,
  fontSize: "0.88rem",
  letterSpacing: "0.02em"
};

const songLengthBadgeStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "#8de8cb",
  border: "1px solid rgba(141, 232, 203, 0.35)",
  borderRadius: "999px",
  padding: "4px 10px",
  background: "rgba(12, 32, 28, 0.55)"
};

const songLengthGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 148px), 1fr))",
  gap: "8px"
};

const songLengthCardStyle: React.CSSProperties = {
  position: "relative",
  display: "grid",
  gap: "4px",
  padding: "10px 10px 11px",
  borderRadius: "12px",
  border: "1px solid rgba(86, 104, 160, 0.45)",
  background: "rgba(8, 14, 28, 0.72)",
  cursor: "pointer",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease",
  minHeight: "92px",
  alignContent: "start"
};

const songLengthCardSelectedStyle: React.CSSProperties = {
  border: "1px solid rgba(154, 132, 255, 0.75)",
  boxShadow: "0 0 0 1px rgba(154, 132, 255, 0.25), 0 10px 22px rgba(95, 110, 255, 0.22)",
  background: "linear-gradient(160deg, rgba(32, 26, 58, 0.95), rgba(14, 20, 42, 0.95))"
};

const songLengthRadioStyle: React.CSSProperties = {
  position: "absolute",
  opacity: 0,
  width: 0,
  height: 0,
  margin: 0
};

const songLengthCardTitleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "8px",
  flexWrap: "wrap"
};

const songLengthCardLabelStyle: React.CSSProperties = {
  color: "#f0f4ff",
  fontWeight: 700,
  fontSize: "0.86rem"
};

const songLengthCardHintStyle: React.CSSProperties = {
  color: "#9eb6ff",
  fontSize: "0.76rem",
  fontWeight: 600
};

const songLengthCardDescStyle: React.CSSProperties = {
  color: "#9aa8cf",
  fontSize: "0.74rem",
  lineHeight: 1.45
};

const advancedSonicDetailsStyle: React.CSSProperties = {
  marginTop: "12px",
  padding: "10px 12px 12px",
  borderRadius: "14px",
  border: "1px solid rgba(118, 136, 210, 0.28)",
  background: "rgba(10, 16, 32, 0.55)",
  minWidth: 0,
  maxWidth: "100%"
};

const advancedSonicSummaryStyle: React.CSSProperties = {
  cursor: "pointer",
  color: "#d7e3ff",
  fontWeight: 700,
  fontSize: "0.86rem",
  letterSpacing: "0.01em"
};

const advancedSonicHintStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#9aa8cf",
  fontSize: "0.76rem",
  lineHeight: 1.45
};

const dnaDetailsStyle: React.CSSProperties = {
  marginTop: "10px",
  padding: "8px 10px",
  borderRadius: "10px",
  border: "1px solid rgba(118, 136, 210, 0.22)",
  background: "rgba(10, 16, 32, 0.4)"
};

const dnaSummaryStyle: React.CSSProperties = {
  cursor: "pointer",
  color: "#c9d7ff",
  fontWeight: 700,
  fontSize: "0.76rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase"
};

const SONG_ARCHITECT_BENEFITS = [
  {
    title: "Build stronger hooks",
    body: "Clarify the line listeners remember — before you generate, record, or master."
  },
  {
    title: "Improve structure and momentum",
    body: "Shape verse/chorus flow and emotional arc so the song keeps moving forward."
  },
  {
    title: "Refine lyrics without losing your voice",
    body: "Tighten phrasing and imagery while keeping the idea authentically yours."
  },
  {
    title: "Shape songs for a specific genre or audience",
    body: "Dial in genre fit, vocal style, and reference direction for a clearer target sound."
  },
  {
    title: "Use it before generating, recording, or mastering",
    body: "Start with a blueprint, then move into Suno, Udio, your DAW, and MasterSauce mastering."
  }
] as const;

const CREATOR_WORKFLOW_STEPS = [
  { title: "Find a direction", detail: "Reference Track · optional" },
  { title: "Design the song", detail: "Song Architect" },
  { title: "Generate externally", detail: "Suno, Udio, or another generator" },
  { title: "Check the result", detail: "Generation Match" },
  { title: "Improve the next generation", detail: "Correction prompt" }
] as const;

export default function SongArchitectPage() {
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<SongArchitectClientPayload | null>(null);
  const [usage, setUsage] = useState<SongArchitectUsage | null>(null);
  const [showEmailVerifyModal, setShowEmailVerifyModal] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [pendingRetryAfterVerify, setPendingRetryAfterVerify] = useState(false);
  const [referenceBlueprint, setReferenceBlueprint] = useState<ReferenceStyleBlueprint | undefined>(undefined);
  const [appliedReference, setAppliedReference] = useState<ReferenceTrackResult | null>(null);
  const [appliedReferenceNonce, setAppliedReferenceNonce] = useState(0);
  const [referencesRefreshKey, setReferencesRefreshKey] = useState(0);
  const [billingEmail, setBillingEmail] = useState("");

  const selectedPreset = useMemo(
    () => SONG_ARCHITECT_PRESETS.find((preset) => preset.id === form.preset) ?? null,
    [form.preset]
  );

  function applyPreset(presetId: string) {
    const preset = SONG_ARCHITECT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setForm((current) => ({
      ...current,
      preset: preset.id,
      genre: preset.defaults.genre ?? current.genre,
      structure: preset.defaults.structure ?? current.structure,
      energyCurve: preset.defaults.energyCurve ?? current.energyCurve,
      lineDensity: preset.defaults.lineDensity ?? current.lineDensity,
      vocalStyle: preset.defaults.vocalStyle ?? current.vocalStyle
    }));
  }

  function getStoredBillingEmail(): string {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(MASTERSOUCE_BILLING_EMAIL_KEY)?.trim().toLowerCase() ?? "";
  }

  function persistBillingEmail(nextEmail: string): void {
    if (typeof window === "undefined") return;
    const normalized = nextEmail.trim().toLowerCase();
    sessionStorage.setItem(MASTERSOUCE_BILLING_EMAIL_KEY, normalized);
    setBillingEmail(normalized);
  }

  function openEmailAccess(options?: { retryGenerate?: boolean }) {
    setVerifyError("");
    setVerifyEmail(getStoredBillingEmail() || billingEmail);
    setPendingRetryAfterVerify(Boolean(options?.retryGenerate));
    setShowEmailVerifyModal(true);
  }

  function attachReference(result: ReferenceTrackResult) {
    setReferenceBlueprint(result.blueprint);
    setAppliedReference(result);
    setAppliedReferenceNonce((current) => current + 1);
  }

  async function runGeneration(payload: SongArchitectInput): Promise<void> {
    setError("");
    setIsGenerating(true);

    try {
      const storedBillingEmail = getStoredBillingEmail();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (storedBillingEmail) {
        headers[MASTERSOUCE_BILLING_EMAIL_HEADER] = storedBillingEmail;
      }
      const response = await fetch("/api/song-architect/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...payload,
          ...(storedBillingEmail ? { billingEmail: storedBillingEmail } : {})
        })
      });

      const data = (await response.json()) as SongArchitectGenerateResponse;
      if (!response.ok || data.ok === false) {
        setResult(null);
        if (data?.usage) setUsage(data.usage);
        if (data?.code === "email_verification_required") {
          console.info("[song-architect] email access confirmation required before generation");
          openEmailAccess({ retryGenerate: true });
          return;
        }
        setError(typeof data?.message === "string" ? data.message : "Song Architect generation is currently unavailable.");
        return;
      }

      if (!data.data || !data.usage) {
        setError("Song Architect generation returned an invalid response.");
        setResult(null);
        return;
      }

      setResult(data.data);
      setUsage(data.usage);
      if (data.data.premiumLocked) {
        trackSongArchitectFunnelEvent("free_tool_success", { plan_id: "free" });
      } else if (data.data.premium) {
        trackSongArchitectFunnelEvent("premium_tool_feature_used", { plan_id: data.data.planId });
      }
    } catch {
      setResult(null);
      setError("Could not generate right now. Please retry in a moment.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = toPayload(form, referenceBlueprint);
    await runGeneration(payload);
  }

  async function verifyEmailAndMaybeRetry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = verifyEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setVerifyError("Enter a valid email address.");
      return;
    }

    setIsVerifyingEmail(true);
    setVerifyError("");
    try {
      const response = await fetch(`/api/song-architect/access?email=${encodeURIComponent(normalizedEmail)}`, {
        method: "GET",
        headers: {
          [MASTERSOUCE_BILLING_EMAIL_HEADER]: normalizedEmail
        }
      });
      const data = (await response.json()) as
        | { ok: true; usage: SongArchitectUsage }
        | { ok: false; message?: string };
      if (!response.ok || !data.ok) {
        setVerifyError(data && "message" in data && typeof data.message === "string" ? data.message : "Unable to confirm email access.");
        return;
      }
      persistBillingEmail(normalizedEmail);
      setUsage(data.usage);
      setShowEmailVerifyModal(false);
      setReferencesRefreshKey((current) => current + 1);
      if (pendingRetryAfterVerify) {
        console.info("[song-architect] generation resumed after email access confirmation");
        setPendingRetryAfterVerify(false);
        await runGeneration(toPayload(form, referenceBlueprint));
      }
    } catch {
      setVerifyError("Could not confirm email access right now. Please try again.");
    } finally {
      setIsVerifyingEmail(false);
    }
  }

  useEffect(() => {
    const storedBillingEmail = getStoredBillingEmail();
    if (!storedBillingEmail) return;
    setBillingEmail(storedBillingEmail);

    void (async () => {
      try {
        const response = await fetch(`/api/song-architect/access?email=${encodeURIComponent(storedBillingEmail)}`, {
          headers: {
            [MASTERSOUCE_BILLING_EMAIL_HEADER]: storedBillingEmail
          }
        });
        const data = (await response.json()) as { ok?: boolean; usage?: SongArchitectUsage };
        if (response.ok && data.ok && data.usage) {
          setUsage(data.usage);
        }
      } catch {
        /* ignore hydrate usage failures */
      }
    })();
  }, []);

  return (
    <main style={mainStyle}>
      <nav aria-label="Song Architect" style={topNavStyle}>
        <Link href="/" style={brandWrapStyle}>
          <Image
            src="/mastersauce-logo.png"
            alt="MasterSauce"
            width={466}
            height={381}
            className="mastersauce-brand-nav__logo"
            sizes="(max-width: 639px) 108px, 148px"
            style={navLogoStyle}
          />
        </Link>
        <Link href="/" style={backLinkStyle}>
          Back to Mastering
        </Link>
      </nav>

      <section style={compactIntroStyle} aria-labelledby="song-architect-heading">
        <p style={eyebrowStyle}>Song Architect</p>
        <h1 id="song-architect-heading" style={titleStyle}>
          Build Better Suno Songs Before You Generate
        </h1>
        <p style={introBodyStyle}>
          Shape lyrics, hooks, structure, vocal direction, and energy before you generate in Suno. The same blueprints
          also work with Udio and other AI music generators. Song Architect helps with verse/chorus flow, energy
          curves, genre guidance, and ready-to-use generation prompts — a creative decision tool, not a hit guarantee.
        </p>
        <p style={introBodyStyle}>
          After you export,{" "}
          <Link href="/suno-mastering" style={introLinkStyle}>
            analyze and master your Suno songs
          </Link>{" "}
          in MasterSauce.
        </p>
        <div style={workflowStyle} aria-labelledby="creator-workflow-heading">
          <p id="creator-workflow-heading" style={workflowHeadingStyle}>
            Your creation workflow
          </p>
          <p style={workflowLeadStyle}>
            One creator path from inspiration to the next generation. Use any step — nothing here is locked in sequence.
          </p>
          <ol style={workflowListStyle}>
            {CREATOR_WORKFLOW_STEPS.map((step, index) => (
              <li key={step.title} style={workflowItemStyle}>
                <span style={workflowNumberStyle} aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  <span style={workflowTitleStyle}>{step.title}</span>
                  <span style={workflowDetailStyle}>{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div style={benefitsGridStyle} aria-label="What Song Architect helps with">
          {SONG_ARCHITECT_BENEFITS.map((item) => (
            <article key={item.title} style={benefitCardStyle}>
              <p style={benefitTitleStyle}>{item.title}</p>
              <p style={benefitBodyStyle}>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={workspaceGridStyle} aria-label="Song Architect tool">
        <form onSubmit={handleGenerate} style={panelStyle}>
          <ReferenceTrackPanel
            attached={Boolean(referenceBlueprint)}
            getBillingEmail={getStoredBillingEmail}
            appliedResult={appliedReference}
            appliedNonce={appliedReferenceNonce}
            onRequireAccess={() => openEmailAccess()}
            onSaved={() => setReferencesRefreshKey((current) => current + 1)}
            onUse={(result: ReferenceTrackResult) => {
              setReferenceBlueprint(result.blueprint);
            }}
            onClear={() => {
              setReferenceBlueprint(undefined);
              setAppliedReference(null);
            }}
          />
          <MyReferencesPanel
            refreshNonce={referencesRefreshKey}
            billingEmail={billingEmail}
            onRequireAccess={() => openEmailAccess()}
            onUse={(result: ReferenceTrackResult) => {
              attachReference(result);
            }}
          />

          <div style={rowHeaderStyle}>
            <h2 style={panelTitleStyle}>Design the song</h2>
          </div>
          <p style={designLeadStyle}>
            This is the primary step. Set genre, mood, structure, energy, vocals, exclusions, and creative constraints.
            A reference is optional guidance — these choices always take priority.
          </p>
          {usage ? (
            <p style={usage.remaining <= 0 ? usageLineWarningStyle : usageLineStyle}>
              {getUsageMessage(usage)} <span style={usagePlanStyle}>({getPlanDisplayName(usage.planId)} plan)</span>
            </p>
          ) : (
            <p style={usageLineMutedStyle}>Usage is tracked per confirmed email access and resets monthly (UTC).</p>
          )}

          <div style={songLengthSectionStyle} role="radiogroup" aria-labelledby="song-length-heading">
            <div style={songLengthHeaderRowStyle}>
              <p id="song-length-heading" style={songLengthHeadingStyle}>
                Song length
              </p>
              <span style={songLengthBadgeStyle}>Structure and lyrics scale to runtime</span>
            </div>
            <div style={songLengthGridStyle}>
              {SONG_LENGTH_UI_OPTIONS.map((option) => {
                const selected = form.songLength === option.id;
                return (
                  <label
                    key={option.id}
                    style={{
                      ...songLengthCardStyle,
                      ...(selected ? songLengthCardSelectedStyle : {})
                    }}
                  >
                    <input
                      type="radio"
                      name="songLength"
                      value={option.id}
                      checked={selected}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          songLength: option.id
                        }))
                      }
                      style={songLengthRadioStyle}
                    />
                    <span style={songLengthCardTitleRowStyle}>
                      <span style={songLengthCardLabelStyle}>{option.label}</span>
                      <span style={songLengthCardHintStyle}>{option.hint}</span>
                    </span>
                    <span style={songLengthCardDescStyle}>{option.description}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="sa-field-grid" style={fieldGridStyle}>
            <label style={fieldLabelStyle}>
              Preset
              <select
                style={inputStyle}
                value={form.preset}
                onChange={(event) => {
                  const presetId = event.target.value;
                  setForm((current) => ({ ...current, preset: presetId }));
                  if (presetId) applyPreset(presetId);
                }}
              >
                <option value="">Custom</option>
                {SONG_ARCHITECT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={fieldLabelStyle}>
              Genre
              <input
                style={inputStyle}
                value={form.genre}
                onChange={(event) => setForm((current) => ({ ...current, genre: event.target.value }))}
                placeholder="Alt pop, trap, EDM..."
              />
            </label>

            <label style={fieldLabelStyle}>
              Theme
              <input
                style={inputStyle}
                value={form.theme}
                onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))}
                placeholder="What is this song about?"
              />
            </label>

            <label style={fieldLabelStyle}>
              Angle
              <input
                style={inputStyle}
                value={form.angle}
                onChange={(event) => setForm((current) => ({ ...current, angle: event.target.value }))}
                placeholder="Point of view or twist"
              />
            </label>

            <label style={fieldLabelStyle}>
              Emotion
              <input
                style={inputStyle}
                value={form.emotion}
                onChange={(event) => setForm((current) => ({ ...current, emotion: event.target.value }))}
                placeholder="Urgent, euphoric, bitter..."
              />
            </label>

            <label style={fieldLabelStyle}>
              Hook Identity
              <input
                style={inputStyle}
                value={form.hookIdentity}
                onChange={(event) => setForm((current) => ({ ...current, hookIdentity: event.target.value }))}
                placeholder="Signature phrase/idea"
              />
            </label>

            <label style={fieldLabelStyle}>
              Structure
              <input
                style={inputStyle}
                value={form.structure}
                onChange={(event) => setForm((current) => ({ ...current, structure: event.target.value }))}
                placeholder="Verse > Pre > Chorus..."
              />
            </label>

            <label style={fieldLabelStyle}>
              Energy Curve
              <input
                style={inputStyle}
                value={form.energyCurve}
                onChange={(event) => setForm((current) => ({ ...current, energyCurve: event.target.value }))}
                placeholder="How intensity evolves"
              />
            </label>

            <label style={fieldLabelStyle}>
              Language
              <input
                style={inputStyle}
                value={form.language}
                onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
                placeholder="English, Spanish..."
              />
            </label>

            <label style={fieldLabelStyle}>
              Vocal Style
              <input
                style={inputStyle}
                value={form.vocalStyle}
                onChange={(event) => setForm((current) => ({ ...current, vocalStyle: event.target.value }))}
                placeholder="Breathy, melodic, gritty..."
              />
            </label>

            <label style={fieldLabelStyle}>
              Line Density
              <select
                style={inputStyle}
                value={form.lineDensity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lineDensity: event.target.value as FormState["lineDensity"]
                  }))
                }
              >
                <option value="sparse">Sparse</option>
                <option value="balanced">Balanced</option>
                <option value="dense">Dense</option>
              </select>
            </label>

            <label style={fieldLabelStyle}>
              Reference Artists (comma separated)
              <input
                style={inputStyle}
                value={form.referenceArtists}
                onChange={(event) => setForm((current) => ({ ...current, referenceArtists: event.target.value }))}
                placeholder="The Weeknd, Fred again.."
              />
            </label>

            <label style={fieldLabelStyle}>
              Must Include (comma separated)
              <input
                style={inputStyle}
                value={form.mustInclude}
                onChange={(event) => setForm((current) => ({ ...current, mustInclude: event.target.value }))}
                placeholder="Neon rain, midnight call"
              />
            </label>

            <label style={fieldLabelStyle}>
              Avoid Words (comma separated)
              <input
                style={inputStyle}
                value={form.avoidWords}
                onChange={(event) => setForm((current) => ({ ...current, avoidWords: event.target.value }))}
                placeholder="Forever, baby"
              />
            </label>
          </div>

          <label style={{ ...fieldLabelStyle, marginTop: "12px" }}>
            Notes (optional)
            <textarea
              style={textareaStyle}
              value={form.userNotes}
              onChange={(event) => setForm((current) => ({ ...current, userNotes: event.target.value }))}
              placeholder="Production context, references, or constraints..."
            />
          </label>

          <details style={advancedSonicDetailsStyle}>
            <summary style={advancedSonicSummaryStyle}>Advanced Sonic Controls</summary>
            <p style={advancedSonicHintStyle}>
              Optional. Defaults stay automatic — Song Architect infers Sonic DNA from genre, emotion, and vocal style.
            </p>
            <div className="sa-field-grid" style={fieldGridStyle}>
              <label style={fieldLabelStyle}>
                BPM / Auto
                <input
                  style={inputStyle}
                  inputMode="numeric"
                  value={form.bpm}
                  onChange={(event) => setForm((current) => ({ ...current, bpm: event.target.value }))}
                  placeholder="Auto"
                />
              </label>
              <label style={fieldLabelStyle}>
                Groove
                <input
                  style={inputStyle}
                  value={form.groove}
                  onChange={(event) => setForm((current) => ({ ...current, groove: event.target.value }))}
                  placeholder="Leave blank to infer"
                />
              </label>
              <label style={fieldLabelStyle}>
                Instrument Focus
                <input
                  style={inputStyle}
                  value={form.instrumentFocus}
                  onChange={(event) => setForm((current) => ({ ...current, instrumentFocus: event.target.value }))}
                  placeholder="Leave blank to infer"
                />
              </label>
              <label style={fieldLabelStyle}>
                Production Era
                <input
                  style={inputStyle}
                  value={form.productionEra}
                  onChange={(event) => setForm((current) => ({ ...current, productionEra: event.target.value }))}
                  placeholder="Leave blank to infer"
                />
              </label>
              <label style={fieldLabelStyle}>
                Production Texture
                <input
                  style={inputStyle}
                  value={form.productionTexture}
                  onChange={(event) => setForm((current) => ({ ...current, productionTexture: event.target.value }))}
                  placeholder="Leave blank to infer"
                />
              </label>
            </div>
          </details>

          {selectedPreset ? <p style={presetHintStyle}>{selectedPreset.description}</p> : null}
          <p style={freeTierNoticeStyle}>3 free blueprints per month — no card required. Email confirmed at export.</p>
          <button type="submit" style={primaryButtonStyle} disabled={isGenerating}>
            {isGenerating ? "Generating..." : "Generate Blueprint"}
          </button>
          {error ? <p style={errorStyle}>{error}</p> : null}
          {error && usage && usage.remaining <= 0 ? (
            <p style={quotaHintStyle}>
              Need more blueprints? <a href="/pricing" style={quotaLinkStyle}>Upgrade your plan</a>.
            </p>
          ) : null}
        </form>

        <aside style={panelStyle} aria-live="polite">
          <h2 style={panelTitleStyle}>Your blueprint</h2>
          {!result ? (
            <p style={emptyStateStyle}>
              Design the song and generate. Your concept, Song DNA, and generation prompt appear here. Then copy a
              prompt into Suno, Udio, or another music generator and come back to check Generation Match. Creator plans
              unlock advanced export and mastering guidance.
            </p>
          ) : (
            <div style={outputStackStyle}>
              {result.premiumLocked ? (
                <PostSuccessUpgradeCta planId={result.planId} remaining={usage?.remaining ?? 0} />
              ) : null}

              <div style={nextStepCardStyle}>
                <p style={outputHeadingStyle}>Now generate this in your music generator</p>
                <ol style={nextStepListStyle}>
                  <li>Copy the generation prompt below.</li>
                  <li>Generate in Suno, Udio, or another music generator.</li>
                  <li>Come back with the result.</li>
                  <li>
                    Use{" "}
                    <a href="#generation-match" style={introLinkStyle}>
                      Generation Match
                    </a>{" "}
                    to see how closely the generation followed your design.
                  </li>
                </ol>
              </div>

              <div style={conceptCardStyle}>
                <p style={outputHeadingStyle}>Concept</p>
                <p style={outputLineStyle}>
                  <strong style={outputKeyStyle}>Theme:</strong> {result.basic.concept.theme}
                </p>
                <p style={outputLineStyle}>
                  <strong style={outputKeyStyle}>Angle:</strong> {result.basic.concept.angle}
                </p>
                <p style={outputLineStyle}>
                  <strong style={outputKeyStyle}>Hook:</strong> {result.basic.concept.hookIdentity}
                </p>
                <p style={outputLineStyle}>
                  <strong style={outputKeyStyle}>Structure:</strong> {result.basic.concept.structure}
                </p>
                {result.basic.meta.songLength ? (
                  <p style={outputLineStyle}>
                    <strong style={outputKeyStyle}>Song length:</strong>{" "}
                    {SONG_LENGTH_UI_OPTIONS.find((o) => o.id === result.basic.meta.songLength)?.label ??
                      result.basic.meta.songLength}{" "}
                    <span style={outputKeyStyle}>
                      ({SONG_LENGTH_UI_OPTIONS.find((o) => o.id === result.basic.meta.songLength)?.hint ?? ""})
                    </span>
                  </p>
                ) : null}
              </div>

              {result.basic.songDNA ? <SongDNAOutputCard songDNA={result.basic.songDNA} /> : null}

              <div style={conceptCardStyle}>
                <div style={outputCardHeaderStyle}>
                  <p style={outputHeadingStyle}>Style Prompt</p>
                  <CopyButton label="Copy Style Prompt" value={result.basic.stylePrompt} />
                </div>
                <pre style={lyricsStyle}>{result.basic.stylePrompt}</pre>
              </div>

              {result.basic.sunoBlueprint ? (
                <div style={conceptCardStyle}>
                  <div style={outputCardHeaderStyle}>
                    <p style={outputHeadingStyle}>Suno Blueprint</p>
                    <CopyButton label="Copy Blueprint" value={result.basic.sunoBlueprint} />
                  </div>
                  <pre style={lyricsStyle}>{result.basic.sunoBlueprint}</pre>
                </div>
              ) : null}

              {result.basic.selection?.whyThisVersion && result.basic.selection.whyThisVersion.length > 0 ? (
                <details style={dnaDetailsStyle}>
                  <summary style={dnaSummaryStyle}>Why this version</summary>
                  <ul style={outputListStyle}>
                    {result.basic.selection.whyThisVersion.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div style={conceptCardStyle}>
                <div style={outputCardHeaderStyle}>
                  <p style={outputHeadingStyle}>Lyrics</p>
                  <CopyButton label="Copy Lyrics" value={result.basic.lyrics} />
                </div>
                <pre style={lyricsStyle}>{result.basic.lyrics}</pre>
              </div>

              {result.basic.selection?.pronunciationAdjustments &&
              result.basic.selection.pronunciationAdjustments.length > 0 ? (
                <details style={dnaDetailsStyle}>
                  <summary style={dnaSummaryStyle}>Pronunciation adjustments</summary>
                  <ul style={outputListStyle}>
                    {result.basic.selection.pronunciationAdjustments.map((item) => (
                      <li key={`${item.word}-${item.pronunciation}`}>
                        {item.word} → {item.pronunciation}
                      </li>
                    ))}
                  </ul>
                  {result.basic.generationOptimizedLyrics &&
                  result.basic.generationOptimizedLyrics !== result.basic.lyrics ? (
                    <>
                      <p style={outputLineStyle}>
                        <strong style={outputKeyStyle}>Generation-optimized lyrics</strong> are for Suno paste only. The
                        lyrics above stay the clean canonical version.
                      </p>
                      <CopyButton label="Copy Generation Lyrics" value={result.basic.generationOptimizedLyrics} />
                      <pre style={lyricsStyle}>{result.basic.generationOptimizedLyrics}</pre>
                    </>
                  ) : null}
                </details>
              ) : null}

              {result.premiumLocked ? (
                <PremiumLockedPanel
                  onUpgradeClick={() =>
                    trackSongArchitectFunnelEvent("free_tool_upgrade_cta_clicked", { plan_id: "free" })
                  }
                />
              ) : result.premium ? (
                <PremiumOutputSections premium={result.premium} />
              ) : null}

              {result.basic.songDNA ? (
                <GenerationMatchPanel
                  songDNA={result.basic.songDNA}
                  stylePrompt={result.basic.stylePrompt}
                  sunoBlueprint={result.basic.sunoBlueprint}
                  getBillingEmail={getStoredBillingEmail}
                  onEmailVerificationRequired={() => {
                    openEmailAccess();
                  }}
                />
              ) : null}
            </div>
          )}
        </aside>
      </section>
      <section style={bottomCtaWrapStyle} aria-label="Next steps after Song Architect">
        <p style={bottomCtaTextStyle}>Already generated? Check the match, then finish the track.</p>
        <div style={bottomCtaRowStyle}>
          <Link href="/" style={bottomCtaPrimaryStyle}>
            Master this song
          </Link>
          <Link href="/ar-ai" style={bottomCtaSecondaryStyle}>
            Analyze release readiness
          </Link>
        </div>
        <p style={bottomCtaHintStyle}>
          Generating in Suno, Udio, or another music generator? Come back to Generation Match first, then see the{" "}
          <Link href="/suno-mastering" style={introLinkStyle}>
            full finishing workflow for Suno creators
          </Link>
          .
        </p>
      </section>
      {showEmailVerifyModal ? (
        <div style={modalBackdropStyle}>
          <div style={modalCardStyle} role="dialog" aria-modal="true" aria-labelledby="verify-song-architect-email-title">
            <p style={modalEyebrowStyle}>Confirmation Required</p>
            <h3 id="verify-song-architect-email-title" style={modalTitleStyle}>
              Confirm email access
            </h3>
            <p style={modalBodyStyle}>
              Song Architect is tied to confirmed email access and anti-abuse checks.
            </p>
            <form onSubmit={verifyEmailAndMaybeRetry} style={modalFormStyle}>
              <input
                type="email"
                autoComplete="email"
                value={verifyEmail}
                onChange={(event) => setVerifyEmail(event.target.value)}
                placeholder="you@example.com"
                style={modalInputStyle}
              />
              <div style={modalActionsStyle}>
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailVerifyModal(false);
                    setPendingRetryAfterVerify(false);
                  }}
                  style={modalSecondaryButtonStyle}
                  disabled={isVerifyingEmail}
                >
                  Cancel
                </button>
                <button type="submit" style={modalPrimaryButtonStyle} disabled={isVerifyingEmail}>
                  {isVerifyingEmail ? "Confirming..." : "Confirm & Continue"}
                </button>
              </div>
            </form>
            {verifyError ? <p style={errorStyle}>{verifyError}</p> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  maxWidth: "1180px",
  margin: "0 auto",
  padding: "14px 16px 36px",
  display: "grid",
  gap: "12px"
};

const topNavStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  flexWrap: "wrap",
  border: "1px solid rgba(84, 100, 148, 0.32)",
  borderRadius: "14px",
  background: "linear-gradient(140deg, rgba(17, 24, 44, 0.78), rgba(10, 16, 31, 0.82))",
  boxShadow: "0 10px 20px rgba(2, 5, 14, 0.34)",
  padding: "10px 12px"
};

const brandWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none"
};

const navLogoStyle: React.CSSProperties = {
  width: "min(100%, clamp(120px, 20vw, 148px))",
  height: "auto"
};

const backLinkStyle: React.CSSProperties = {
  color: "#b9c6ef",
  textDecoration: "none",
  fontSize: "0.86rem",
  fontWeight: 600,
  border: "1px solid rgba(86, 102, 156, 0.34)",
  borderRadius: "999px",
  padding: "8px 12px",
  background: "rgba(14, 22, 40, 0.68)"
};

const compactIntroStyle: React.CSSProperties = {
  border: "1px solid rgba(142, 155, 209, 0.2)",
  borderRadius: "18px",
  boxShadow: "0 12px 28px rgba(2, 4, 12, 0.32)",
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.9), rgba(12, 17, 30, 0.9))",
  padding: "14px 16px",
  minWidth: 0
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#b7c4ff",
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.14em"
};

const titleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: "clamp(1.35rem, 2.5vw, 1.9rem)",
  color: "#f1f4ff",
  lineHeight: 1.1,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};

const introBodyStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#aab8dc",
  lineHeight: 1.5
};

const introLinkStyle: React.CSSProperties = {
  color: "#a8b8f0",
  textDecoration: "underline",
  textDecorationColor: "rgba(143, 160, 230, 0.45)",
  textUnderlineOffset: "3px"
};

const workflowStyle: React.CSSProperties = {
  marginTop: "12px",
  minWidth: 0
};

const workflowHeadingStyle: React.CSSProperties = {
  margin: 0,
  color: "#e8edff",
  fontWeight: 700,
  fontSize: "0.86rem",
  letterSpacing: "0.02em"
};

const workflowLeadStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#9aa8cf",
  fontSize: "0.78rem",
  lineHeight: 1.45
};

const workflowListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: "10px 0 0",
  padding: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 148px), 1fr))",
  gap: "8px"
};

const workflowItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "8px",
  minWidth: 0,
  padding: "8px 9px",
  borderRadius: "12px",
  border: "1px solid rgba(110, 128, 190, 0.22)",
  background: "rgba(14, 21, 38, 0.55)"
};

const workflowNumberStyle: React.CSSProperties = {
  flexShrink: 0,
  width: "20px",
  height: "20px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "rgba(154, 132, 255, 0.22)",
  color: "#d7e3ff",
  fontSize: "0.7rem",
  fontWeight: 700,
  lineHeight: 1
};

const workflowTitleStyle: React.CSSProperties = {
  display: "block",
  color: "#e8edff",
  fontWeight: 700,
  fontSize: "0.78rem",
  lineHeight: 1.35
};

const workflowDetailStyle: React.CSSProperties = {
  display: "block",
  marginTop: "2px",
  color: "#9aa8cf",
  fontSize: "0.72rem",
  lineHeight: 1.4
};

const benefitsGridStyle: React.CSSProperties = {
  marginTop: "14px",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
  gap: "10px"
};

const benefitCardStyle: React.CSSProperties = {
  border: "1px solid rgba(110, 128, 190, 0.24)",
  borderRadius: "12px",
  background: "rgba(14, 21, 38, 0.68)",
  padding: "10px 12px"
};

const benefitTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#d7e3ff",
  fontWeight: 700,
  fontSize: "0.84rem",
  lineHeight: 1.35
};

const benefitBodyStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#a7b6dc",
  fontSize: "0.82rem",
  lineHeight: 1.5
};

const workspaceGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
  alignItems: "start"
};

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(142, 155, 209, 0.2)",
  borderRadius: "18px",
  boxShadow: "0 14px 30px rgba(2, 4, 12, 0.36)",
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.92), rgba(12, 17, 30, 0.92))",
  padding: "14px",
  minWidth: 0
};

const rowHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "16px"
};

const designLeadStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#a7b6dc",
  fontSize: "0.82rem",
  lineHeight: 1.5
};

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#ecf1ff",
  fontSize: "1.05rem",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};

const fieldGridStyle: React.CSSProperties = {
  marginTop: "12px",
  display: "grid",
  gap: "10px",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0
};

const fieldLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#cad6f6",
  fontSize: "0.82rem",
  minWidth: 0,
  maxWidth: "100%"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  borderRadius: "10px",
  border: "1px solid rgba(84, 104, 156, 0.4)",
  background: "rgba(11, 18, 35, 0.72)",
  color: "#e7edff",
  padding: "10px 11px",
  fontSize: "0.9rem"
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: "92px"
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  borderRadius: "999px",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  boxShadow: "0 12px 30px rgba(121, 100, 255, 0.36)",
  color: "#fff",
  fontWeight: 700,
  padding: "10px 16px"
};

const freeTierNoticeStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#95a4d2",
  fontSize: "0.78rem",
  lineHeight: 1.4
};

const presetHintStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#9fb0dc",
  fontSize: "0.86rem"
};

const errorStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#ffbac8",
  fontWeight: 600,
  fontSize: "0.88rem"
};

const usageLineStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#9ed5c3",
  fontSize: "0.84rem",
  lineHeight: 1.5
};

const usageLineWarningStyle: React.CSSProperties = {
  ...usageLineStyle,
  color: "#ffd4b1"
};

const usagePlanStyle: React.CSSProperties = {
  color: "#8fa0cf"
};

const usageLineMutedStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#95a4d2",
  fontSize: "0.82rem",
  lineHeight: 1.5
};

const quotaHintStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#a8c4bb",
  fontSize: "0.84rem"
};

const quotaLinkStyle: React.CSSProperties = {
  color: "#8de8cb",
  textDecoration: "underline"
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 90,
  display: "grid",
  placeItems: "center",
  background: "rgba(2, 5, 14, 0.72)",
  backdropFilter: "blur(4px)",
  padding: "20px"
};

const modalCardStyle: React.CSSProperties = {
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

const modalFormStyle: React.CSSProperties = {
  marginTop: "16px",
  display: "grid",
  gap: "10px"
};

const modalInputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  border: "1px solid rgba(134, 153, 212, 0.5)",
  background: "rgba(10, 17, 34, 0.94)",
  color: "#f3f7ff",
  fontSize: "1rem",
  padding: "12px 13px",
  outline: "none"
};

const modalActionsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  flexWrap: "wrap"
};

const modalSecondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(136, 154, 212, 0.42)",
  borderRadius: "11px",
  background: "rgba(13, 21, 40, 0.9)",
  color: "#b4c3ec",
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const modalPrimaryButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: "11px",
  background: "linear-gradient(125deg, #8b79ff 0%, #5e7dff 100%)",
  color: "#ffffff",
  padding: "10px 14px",
  fontWeight: 700,
  boxShadow: "0 10px 24px rgba(95, 121, 255, 0.35)",
  cursor: "pointer"
};

const emptyStateStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#9fb0dc",
  lineHeight: 1.6
};

const outputStackStyle: React.CSSProperties = {
  marginTop: "12px",
  display: "grid",
  gap: "10px"
};

const conceptCardStyle: React.CSSProperties = {
  border: "1px solid rgba(88, 106, 167, 0.34)",
  borderRadius: "12px",
  padding: "10px",
  background: "rgba(14, 20, 38, 0.8)"
};

const nextStepCardStyle: React.CSSProperties = {
  border: "1px solid rgba(141, 232, 203, 0.28)",
  borderRadius: "12px",
  padding: "10px 12px",
  background: "linear-gradient(160deg, rgba(16, 36, 32, 0.88), rgba(14, 20, 38, 0.86))"
};

const nextStepListStyle: React.CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: "18px",
  color: "#c5d4ef",
  fontSize: "0.82rem",
  lineHeight: 1.55
};

const outputHeadingStyle: React.CSSProperties = {
  margin: 0,
  color: "#cedbff",
  fontWeight: 700,
  fontSize: "0.8rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em"
};

const outputCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  flexWrap: "wrap"
};

const copyButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(110, 127, 183, 0.45)",
  borderRadius: "999px",
  background: "rgba(17, 24, 43, 0.76)",
  color: "#c9d7ff",
  fontWeight: 600,
  fontSize: "0.76rem",
  padding: "6px 10px",
  cursor: "pointer",
  lineHeight: 1.1
};

const outputLineStyle: React.CSSProperties = {
  margin: "7px 0 0",
  color: "#dfe8ff",
  lineHeight: 1.45
};

const outputKeyStyle: React.CSSProperties = {
  color: "#9fb3e7"
};

const metricRowStyle: React.CSSProperties = {
  marginTop: "7px",
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  color: "#dbe5ff"
};

const metricKeyStyle: React.CSSProperties = {
  color: "#a6b8e8",
  textTransform: "capitalize",
  fontSize: "0.9rem"
};

const metricValueStyle: React.CSSProperties = {
  fontWeight: 700
};

const outputListStyle: React.CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: "18px",
  color: "#dbe5ff",
  lineHeight: 1.5
};

const lyricsStyle: React.CSSProperties = {
  margin: "8px 0 0",
  whiteSpace: "pre-wrap",
  color: "#dbe5ff",
  fontSize: "0.9rem",
  lineHeight: 1.55,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
};

const readonlyTextareaStyle: React.CSSProperties = {
  ...textareaStyle,
  minHeight: "170px"
};

const bottomCtaWrapStyle: React.CSSProperties = {
  border: "1px solid rgba(142, 155, 209, 0.2)",
  borderRadius: "14px",
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.88), rgba(12, 17, 30, 0.88))",
  padding: "16px",
  textAlign: "center"
};

const bottomCtaTextStyle: React.CSSProperties = {
  margin: "0 0 12px",
  color: "#c9d4f5",
  fontWeight: 600,
  fontSize: "0.95rem"
};

const bottomCtaHintStyle: React.CSSProperties = {
  margin: "12px 0 0",
  color: "#9ca8cc",
  fontSize: "0.88rem",
  lineHeight: 1.55
};

const bottomCtaRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: "10px"
};

const bottomCtaPrimaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  borderRadius: "999px",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: "0.9rem",
  padding: "11px 20px"
};

const bottomCtaSecondaryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  borderRadius: "999px",
  border: "1px solid rgba(136, 154, 212, 0.5)",
  color: "#d6defa",
  fontWeight: 600,
  fontSize: "0.9rem",
  padding: "10px 18px",
  background: "rgba(13, 21, 40, 0.65)"
};
