"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MASTERSOUCE_BILLING_EMAIL_HEADER, MASTERSOUCE_BILLING_EMAIL_KEY } from "@/lib/billing/client-key";
import { trackSongArchitectFunnelEvent } from "@/lib/song-architect/analytics";
import type { SongArchitectClientPayload } from "@/lib/song-architect/premium-output";
import { SONG_ARCHITECT_PRESETS } from "@/lib/song-architect/presets";
import { SONG_LENGTH_UI_OPTIONS } from "@/lib/song-architect/song-length";
import type { SongArchitectInput, SongArchitectPremiumEnhancements, SongArchitectSongLength } from "@/lib/song-architect/types";
import { PostSuccessUpgradeCta, PremiumLockedPanel } from "@/components/song-architect/upgrade-moment";

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
  userNotes: ""
};

function csvToList(value: string): string[] | undefined {
  const parsed = value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

function toPayload(form: FormState): SongArchitectInput {
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
    userNotes: form.userNotes.trim() || undefined
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
  gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))",
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
  fontWeight: 600,
  whiteSpace: "nowrap"
};

const songLengthCardDescStyle: React.CSSProperties = {
  color: "#9aa8cf",
  fontSize: "0.74rem",
  lineHeight: 1.45
};

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
    sessionStorage.setItem(MASTERSOUCE_BILLING_EMAIL_KEY, nextEmail.trim().toLowerCase());
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
          setVerifyError("");
          setVerifyEmail(storedBillingEmail);
          setPendingRetryAfterVerify(true);
          setShowEmailVerifyModal(true);
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
    const payload = toPayload(form);
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
      if (pendingRetryAfterVerify) {
        console.info("[song-architect] generation resumed after email access confirmation");
        setPendingRetryAfterVerify(false);
        await runGeneration(toPayload(form));
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
        <div style={brandWrapStyle}>
          <span style={brandMarkStyle}>♫</span>
          <div>
            <p style={brandTextStyle}>MasterSauce</p>
            <p style={brandSubStyle}>Song Architect Workspace</p>
          </div>
        </div>
        <Link href="/" style={backLinkStyle}>
          Back to Mastering
        </Link>
      </nav>

      <section style={compactIntroStyle} aria-labelledby="song-architect-heading">
        <p style={eyebrowStyle}>Workspace</p>
        <h1 id="song-architect-heading" style={titleStyle}>
          Write better Suno and Udio prompts — in seconds.
        </h1>
        <p style={introBodyStyle}>
          Stop guessing what to type. Song Architect builds your complete creative blueprint — genre, lyrics, hooks, style
          prompt, and a ready-to-paste Suno or Udio export prompt. One pass. No blank page.
        </p>
        <div style={howItWorksGridStyle} aria-label="How Song Architect works">
          <article style={howItWorksStepStyle}>
            <p style={howItWorksTitleStyle}>Step 1 — 🎚️ Pick a preset or build custom</p>
            <p style={howItWorksBodyStyle}>
              Choose from Radio Pop, Dark Trap, Festival EDM, and more — or configure every detail yourself.
            </p>
          </article>
          <article style={howItWorksStepStyle}>
            <p style={howItWorksTitleStyle}>Step 2 — ⚙️ Generate your blueprint</p>
            <p style={howItWorksBodyStyle}>
              Song Architect writes your concept, style prompt, lyrics, and a ready-to-paste export prompt in one pass.
            </p>
          </article>
          <article style={howItWorksStepStyle}>
            <p style={howItWorksTitleStyle}>Step 3 — 🎵 Paste into Suno or Udio</p>
            <p style={howItWorksBodyStyle}>
              Copy your export prompt directly into Suno or Udio and create. When your track is ready, master it free on
              MasterSauce.
            </p>
          </article>
        </div>
      </section>

      <section style={workspaceGridStyle} aria-label="Song Architect tool">
        <form onSubmit={handleGenerate} style={panelStyle}>
          <div style={rowHeaderStyle}>
            <h2 style={panelTitleStyle}>Input</h2>
          </div>
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

          <div style={fieldGridStyle}>
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
          <h2 style={panelTitleStyle}>Output</h2>
          {!result ? (
            <p style={emptyStateStyle}>
              Configure your inputs and generate. Your concept, style prompt, and lyrics appear here. Creator plans unlock
              advanced export and mastering guidance.
            </p>
          ) : (
            <div style={outputStackStyle}>
              {result.premiumLocked ? (
                <PostSuccessUpgradeCta planId={result.planId} remaining={usage?.remaining ?? 0} />
              ) : null}

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

              <div style={conceptCardStyle}>
                <div style={outputCardHeaderStyle}>
                  <p style={outputHeadingStyle}>Style Prompt</p>
                  <CopyButton label="Copy Style Prompt" value={result.basic.stylePrompt} />
                </div>
                <pre style={lyricsStyle}>{result.basic.stylePrompt}</pre>
              </div>

              <div style={conceptCardStyle}>
                <div style={outputCardHeaderStyle}>
                  <p style={outputHeadingStyle}>Lyrics</p>
                  <CopyButton label="Copy Lyrics" value={result.basic.lyrics} />
                </div>
                <pre style={lyricsStyle}>{result.basic.lyrics}</pre>
              </div>

              {result.premiumLocked ? (
                <PremiumLockedPanel
                  onUpgradeClick={() =>
                    trackSongArchitectFunnelEvent("free_tool_upgrade_cta_clicked", { plan_id: "free" })
                  }
                />
              ) : result.premium ? (
                <PremiumOutputSections premium={result.premium} />
              ) : null}
            </div>
          )}
        </aside>
      </section>
      <section style={bottomCtaWrapStyle} aria-label="MasterSauce mastering call to action">
        <p style={bottomCtaTextStyle}>
          Track ready? Master it free on MasterSauce{" "}
          <a href="https://www.mastersauce.ai/#master" style={bottomCtaLinkStyle}>
            →
          </a>
        </p>
      </section>
      {showEmailVerifyModal ? (
        <div style={modalBackdropStyle}>
          <div style={modalCardStyle} role="dialog" aria-modal="true" aria-labelledby="verify-song-architect-email-title">
            <p style={modalEyebrowStyle}>Confirmation Required</p>
            <h3 id="verify-song-architect-email-title" style={modalTitleStyle}>
              Confirm email access to generate
            </h3>
            <p style={modalBodyStyle}>
              Song Architect generation is tied to confirmed email access and anti-abuse checks.
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
  gap: "8px"
};

const brandMarkStyle: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "8px",
  display: "grid",
  placeItems: "center",
  color: "#fff",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)"
};

const brandTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#e7edff",
  fontWeight: 700,
  lineHeight: 1.1
};

const brandSubStyle: React.CSSProperties = {
  margin: 0,
  color: "#95a4d2",
  fontSize: "0.76rem",
  lineHeight: 1.2
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
  padding: "14px 16px"
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

const howItWorksGridStyle: React.CSSProperties = {
  marginTop: "12px",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px"
};

const howItWorksStepStyle: React.CSSProperties = {
  border: "1px solid rgba(110, 128, 190, 0.24)",
  borderRadius: "12px",
  background: "rgba(14, 21, 38, 0.68)",
  padding: "10px"
};

const howItWorksTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#d7e3ff",
  fontWeight: 700,
  fontSize: "0.83rem",
  lineHeight: 1.4
};

const howItWorksBodyStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#a7b6dc",
  fontSize: "0.83rem",
  lineHeight: 1.5
};

const workspaceGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  alignItems: "start"
};

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(142, 155, 209, 0.2)",
  borderRadius: "18px",
  boxShadow: "0 14px 30px rgba(2, 4, 12, 0.36)",
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.92), rgba(12, 17, 30, 0.92))",
  padding: "14px"
};

const rowHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  flexWrap: "wrap"
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
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "10px"
};

const fieldLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#cad6f6",
  fontSize: "0.82rem"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
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
  padding: "12px 14px"
};

const bottomCtaTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#b2c0e6",
  lineHeight: 1.5
};

const bottomCtaLinkStyle: React.CSSProperties = {
  color: "#8de8cb",
  textDecoration: "none",
  fontWeight: 700
};
