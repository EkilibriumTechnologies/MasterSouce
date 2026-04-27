"use client";

import { ChangeEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CompareSpectrum } from "@/components/audio-compare-spectrum";

const EDM_ORIGINAL_SRC = "/audio/Mercaba Center Earth Before.wav";
const EDM_MASTERED_SRC = "/audio/Mercaba Center Earth After.wav";

const REGGAETON_ORIGINAL_SRC = "/audio/Vamo Alla Before.wav";
const REGGAETON_MASTERED_SRC = "/audio/Vamo Alla After.wav";

const HIPHOP_ORIGINAL_SRC = "/audio/Jucy Mama Juice before.wav";
const HIPHOP_MASTERED_SRC = "/audio/Jucy Mama Juice After.wav";

/**
 * Bump this whenever the underlying demo assets change but filenames stay the same.
 * This avoids stale browser/CDN caches serving the old full-length WAVs.
 */
const STATIC_DEMO_AUDIO_ASSET_REV = "20260428c";

/** Encode each path segment so filenames with spaces (e.g. /public/audio/...) load reliably in <audio src>. */
function encodePathSegments(pathWithOptionalQuery: string): string {
  const qIndex = pathWithOptionalQuery.indexOf("?");
  const path = qIndex >= 0 ? pathWithOptionalQuery.slice(0, qIndex) : pathWithOptionalQuery;
  const query = qIndex >= 0 ? pathWithOptionalQuery.slice(qIndex) : "";
  if (!path.startsWith("/")) return pathWithOptionalQuery;
  const encoded =
    "/" +
    path
      .slice(1)
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  return encoded + query;
}

function withAssetRev(src: string): string {
  const base = encodePathSegments(src);
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}v=${encodeURIComponent(STATIC_DEMO_AUDIO_ASSET_REV)}`;
}

/**
 * Ensures only one static homepage A/B pair can play audio at a time.
 * (Each pair still has its own WebAudio graph + analysers.)
 */
const exclusiveStopHandlers = new Map<string, () => void>();
let exclusiveActiveId: string | null = null;

function exclusiveBeginPlayback(pairId: string) {
  if (exclusiveActiveId && exclusiveActiveId !== pairId) {
    const stopOther = exclusiveStopHandlers.get(exclusiveActiveId);
    stopOther?.();
  }
  exclusiveActiveId = pairId;
}

function exclusiveUnregister(pairId: string) {
  if (exclusiveActiveId === pairId) exclusiveActiveId = null;
  exclusiveStopHandlers.delete(pairId);
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const floored = Math.floor(seconds);
  const mins = Math.floor(floored / 60);
  const secs = floored % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type StaticBeforeAfterPairProps = {
  pairId: string;
  badgeLabel: string;
  originalSrc: string;
  masteredSrc: string;
  /** Small label above the two cards (optional) */
  pairEyebrow?: string;
  originalTitle?: string;
  masteredTitle?: string;
  originalSubtitle?: string;
  masteredSubtitle?: string;
};

function StaticBeforeAfterPair({
  pairId,
  badgeLabel,
  originalSrc,
  masteredSrc,
  pairEyebrow,
  originalTitle = "Original",
  masteredTitle = "Mastered",
  originalSubtitle = "Unmastered track",
  masteredSubtitle = "After MasterSauce"
}: StaticBeforeAfterPairProps) {
  const originalRef = useRef<HTMLAudioElement>(null);
  const masteredRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const originalAnalyserRef = useRef<AnalyserNode | null>(null);
  const masteredAnalyserRef = useRef<AnalyserNode | null>(null);
  const wiredRef = useRef(false);
  const activeSourceRef = useRef<"original" | "mastered">("original");
  const [activeSource, setActiveSource] = useState<"original" | "mastered">("original");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [masteredDuration, setMasteredDuration] = useState(0);

  const originalSrcResolved = useMemo(() => withAssetRev(originalSrc), [originalSrc]);
  const masteredSrcResolved = useMemo(() => withAssetRev(masteredSrc), [masteredSrc]);

  const sharedDuration = Math.max(originalDuration, masteredDuration);
  const sharedProgress = sharedDuration > 0 ? (currentTime / sharedDuration) * 100 : 0;
  const originalIsPlaying = activeSource === "original" && isPlaying;

  useLayoutEffect(() => {
    activeSourceRef.current = activeSource;
  }, [activeSource]);

  useEffect(() => {
    return () => {
      wiredRef.current = false;
      originalAnalyserRef.current = null;
      masteredAnalyserRef.current = null;
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  function getAudio(target: "original" | "mastered") {
    return target === "original" ? originalRef.current : masteredRef.current;
  }

  function syncTimeToBoth(timeInSec: number) {
    const original = originalRef.current;
    const mastered = masteredRef.current;
    const originalLiveDur = original?.duration;
    const masteredLiveDur = mastered?.duration;
    const maxDur = Math.max(
      originalDuration,
      masteredDuration,
      typeof originalLiveDur === "number" && Number.isFinite(originalLiveDur) ? originalLiveDur : 0,
      typeof masteredLiveDur === "number" && Number.isFinite(masteredLiveDur) ? masteredLiveDur : 0
    );
    const clamped = maxDur > 0 ? Math.min(timeInSec, maxDur) : timeInSec;
    if (original) original.currentTime = clamped;
    if (mastered) mastered.currentTime = clamped;
  }

  function seekByRatio(ratio: number, target: "original" | "mastered") {
    const el = getAudio(target);
    const targetDuration =
      (target === "original" ? originalDuration : masteredDuration) ||
      (el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0);
    if (!targetDuration) return;
    const nextTime = ratio * targetDuration;
    syncTimeToBoth(nextTime);
    setCurrentTime(nextTime);
    setActiveSource(target);
    activeSourceRef.current = target;
  }

  function seekWithSlider(event: ChangeEvent<HTMLInputElement>, target: "original" | "mastered") {
    const ratio = Number(event.currentTarget.value) / 100;
    seekByRatio(Math.max(0, Math.min(1, ratio)), target);
  }

  function ensureWebAudioGraph(): void {
    if (typeof window === "undefined") return;
    const existing = audioContextRef.current;
    if (wiredRef.current && existing && existing.state !== "closed") return;

    const originalEl = originalRef.current;
    const masteredEl = masteredRef.current;
    if (!originalEl || !masteredEl) return;

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;

    const ctx = new AC({ latencyHint: "interactive" });
    try {
      const origSrc = ctx.createMediaElementSource(originalEl);
      const mastSrc = ctx.createMediaElementSource(masteredEl);
      const origAn = ctx.createAnalyser();
      const mastAn = ctx.createAnalyser();
      origAn.fftSize = 512;
      mastAn.fftSize = 512;
      origAn.smoothingTimeConstant = 0.52;
      mastAn.smoothingTimeConstant = 0.36;
      origSrc.connect(origAn);
      origAn.connect(ctx.destination);
      mastSrc.connect(mastAn);
      mastAn.connect(ctx.destination);
      audioContextRef.current = ctx;
      originalAnalyserRef.current = origAn;
      masteredAnalyserRef.current = mastAn;
      wiredRef.current = true;
    } catch {
      wiredRef.current = false;
      originalAnalyserRef.current = null;
      masteredAnalyserRef.current = null;
      audioContextRef.current = null;
      void ctx.close();
    }
  }

  async function playSource(target: "original" | "mastered") {
    const nextAudio = getAudio(target);
    const otherAudio = getAudio(target === "original" ? "mastered" : "original");
    if (!nextAudio) return;

    exclusiveBeginPlayback(pairId);
    ensureWebAudioGraph();
    otherAudio?.pause();
    setActiveSource(target);
    activeSourceRef.current = target;
    const ac = audioContextRef.current;
    if (ac?.state === "suspended") {
      try {
        await ac.resume();
      } catch {
        /* ignore */
      }
    }
    const declared = getDuration(target);
    const probed = Number.isFinite(nextAudio.duration) && nextAudio.duration > 0 ? nextAudio.duration : 0;
    const dur = declared || probed;
    nextAudio.currentTime = dur > 0 ? Math.min(currentTime, dur) : currentTime;
    try {
      await nextAudio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }

  function pauseActive() {
    getAudio(activeSource)?.pause();
    setIsPlaying(false);
  }

  const stopPairPlayback = useCallback(() => {
    originalRef.current?.pause();
    masteredRef.current?.pause();
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    exclusiveStopHandlers.set(pairId, stopPairPlayback);
    return () => exclusiveUnregister(pairId);
  }, [pairId, stopPairPlayback]);

  function getDuration(target: "original" | "mastered") {
    return target === "original" ? originalDuration : masteredDuration;
  }

  const refreshDurationsFromElements = useCallback(() => {
    const o = originalRef.current;
    const m = masteredRef.current;
    if (o && Number.isFinite(o.duration) && o.duration > 0) setOriginalDuration(o.duration);
    if (m && Number.isFinite(m.duration) && m.duration > 0) setMasteredDuration(m.duration);
  }, []);

  const hintOriginal = "Your mix as uploaded";
  const hintMastered = "More clarity, level, and punch";

  return (
    <div style={pairWrapStyle}>
      {pairEyebrow ? <p style={pairEyebrowStyle}>{pairEyebrow}</p> : null}
      <div style={gridStyle}>
        <div
          style={{
            ...(activeSource === "original" ? masteredCardStyle : cardStyle),
            ...cardTransitionStyle,
            ...(activeSource === "original" ? cardActiveRingOriginalStyle : null)
          }}
        >
          <div style={labelRowStyle}>
            <p style={labelStyle}>{originalTitle}</p>
            <span style={badgeStyle}>{badgeLabel}</span>
          </div>
          <p style={labelSubStyle}>{originalSubtitle}</p>
          <p style={dynamicHintStyle(activeSource === "original")}>{hintOriginal}</p>
          <div
            style={{
              ...spectrumShellStyle,
              ...(activeSource === "original" ? spectrumShellActiveOriginalStyle : spectrumShellIdleStyle)
            }}
          >
            <CompareSpectrum
              analyserRef={originalAnalyserRef}
              isActivePlaying={activeSource === "original" && isPlaying}
              variant="original"
            />
          </div>
          <audio
            ref={originalRef}
            preload="auto"
            style={hiddenAudioStyle}
            src={originalSrcResolved}
            onLoadedMetadata={() => refreshDurationsFromElements()}
            onLoadedData={() => refreshDurationsFromElements()}
            onDurationChange={() => refreshDurationsFromElements()}
            onTimeUpdate={(event) => {
              if (activeSourceRef.current !== "original") return;
              setCurrentTime(event.currentTarget.currentTime || 0);
            }}
            onEnded={() => {
              if (activeSourceRef.current !== "original") return;
              setIsPlaying(false);
              setCurrentTime(0);
              syncTimeToBoth(0);
            }}
          />
          <button
            type="button"
            style={
              activeSource === "original"
                ? originalIsPlaying
                  ? masteredPlayButtonActiveStyle
                  : masteredPlayButtonStyle
                : playButtonStyle
            }
            onClick={() => {
              if (activeSource === "original" && isPlaying) {
                pauseActive();
                return;
              }
              void playSource("original");
            }}
          >
            {originalIsPlaying ? "Pause Original" : "Play Original"}
          </button>
          <div style={timerRowStyle}>
            <span>{formatTime(currentTime)}</span>
            <span style={timerSeparatorStyle}>/</span>
            <span>{formatTime(sharedDuration)}</span>
          </div>
          <div style={progressSliderWrapStyle}>
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={Math.max(0, Math.min(100, sharedProgress))}
              onChange={(event) => seekWithSlider(event, "original")}
              aria-label="Seek original preview"
              style={{
                ...(activeSource === "original" ? masteredProgressSliderStyle : progressSliderStyle),
                background:
                  activeSource === "original"
                    ? `linear-gradient(90deg, #7e5cff 0%, #6d87ff ${Math.max(0, Math.min(100, sharedProgress))}%, rgba(107, 82, 194, 0.32) ${Math.max(0, Math.min(100, sharedProgress))}%, rgba(107, 82, 194, 0.32) 100%)`
                    : `linear-gradient(90deg, rgba(177, 188, 225, 0.95) 0%, rgba(116, 130, 178, 0.98) ${Math.max(0, Math.min(100, sharedProgress))}%, rgba(92, 108, 156, 0.34) ${Math.max(0, Math.min(100, sharedProgress))}%, rgba(92, 108, 156, 0.34) 100%)`
              }}
            />
          </div>
        </div>

        <div
          style={{
            ...(activeSource === "mastered" ? masteredCardStyle : cardStyle),
            ...cardTransitionStyle,
            ...(activeSource === "mastered" ? cardActiveRingMasteredStyle : null)
          }}
        >
          <div style={labelRowStyle}>
            <p style={masteredLabelStyle}>{masteredTitle}</p>
            <span style={badgeStyle}>{badgeLabel}</span>
          </div>
          <p style={labelSubStyle}>{masteredSubtitle}</p>
          <p style={dynamicHintStyle(activeSource === "mastered")}>{hintMastered}</p>
          <div
            style={{
              ...spectrumShellStyle,
              ...(activeSource === "mastered" ? spectrumShellActiveMasteredStyle : spectrumShellIdleStyle)
            }}
          >
            <CompareSpectrum
              analyserRef={masteredAnalyserRef}
              isActivePlaying={activeSource === "mastered" && isPlaying}
              variant="mastered"
            />
          </div>
          <audio
            ref={masteredRef}
            preload="auto"
            style={hiddenAudioStyle}
            src={masteredSrcResolved}
            onLoadedMetadata={() => refreshDurationsFromElements()}
            onLoadedData={() => refreshDurationsFromElements()}
            onDurationChange={() => refreshDurationsFromElements()}
            onTimeUpdate={(event) => {
              if (activeSourceRef.current !== "mastered") return;
              setCurrentTime(event.currentTarget.currentTime || 0);
            }}
            onEnded={() => {
              if (activeSourceRef.current !== "mastered") return;
              setIsPlaying(false);
              setCurrentTime(0);
              syncTimeToBoth(0);
            }}
          />
          <button
            type="button"
            style={
              activeSource === "mastered"
                ? isPlaying
                  ? masteredPlayButtonActiveStyle
                  : masteredPlayButtonStyle
                : playButtonStyle
            }
            onClick={() => {
              const nextSource = activeSource === "original" ? "mastered" : "original";
              void playSource(nextSource);
            }}
          >
            {activeSource === "original" ? "Switch to Mastered" : "Switch to Original"}
          </button>
          <div style={timerRowStyle}>
            <span>{formatTime(currentTime)}</span>
            <span style={timerSeparatorStyle}>/</span>
            <span>{formatTime(sharedDuration)}</span>
          </div>
          <div style={progressSliderWrapStyle}>
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={Math.max(0, Math.min(100, sharedProgress))}
              onChange={(event) => seekWithSlider(event, "mastered")}
              aria-label="Seek mastered preview"
              style={{
                ...(activeSource === "mastered" ? masteredProgressSliderStyle : progressSliderStyle),
                background:
                  activeSource === "mastered"
                    ? `linear-gradient(90deg, #7e5cff 0%, #6d87ff ${Math.max(0, Math.min(100, sharedProgress))}%, rgba(107, 82, 194, 0.32) ${Math.max(0, Math.min(100, sharedProgress))}%, rgba(107, 82, 194, 0.32) 100%)`
                    : `linear-gradient(90deg, rgba(177, 188, 225, 0.95) 0%, rgba(116, 130, 178, 0.98) ${Math.max(0, Math.min(100, sharedProgress))}%, rgba(92, 108, 156, 0.34) ${Math.max(0, Math.min(100, sharedProgress))}%, rgba(92, 108, 156, 0.34) 100%)`
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export type StaticBeforeAfterArticleSingleProps = {
  pairId: string;
  sectionTitle: string;
  sectionSubtitle: string;
  badgeLabel: string;
  originalSrc: string;
  masteredSrc: string;
  originalTitle?: string;
  masteredTitle?: string;
  originalSubtitle?: string;
  masteredSubtitle?: string;
};

export type StaticBeforeAfterDemoProps = {
  /** One pair + custom headings (e.g. learn article). Omit for homepage triple demo. */
  articleSingle?: StaticBeforeAfterArticleSingleProps;
};

export function StaticBeforeAfterDemo({ articleSingle }: StaticBeforeAfterDemoProps = {}) {
  if (articleSingle) {
    return (
      <section style={articleEmbedPanelStyle}>
        <h3 style={headingStyle}>{articleSingle.sectionTitle}</h3>
        <p style={mutedText}>{articleSingle.sectionSubtitle}</p>
        <StaticBeforeAfterPair
          pairId={articleSingle.pairId}
          badgeLabel={articleSingle.badgeLabel}
          originalSrc={articleSingle.originalSrc}
          masteredSrc={articleSingle.masteredSrc}
          originalTitle={articleSingle.originalTitle}
          masteredTitle={articleSingle.masteredTitle}
          originalSubtitle={articleSingle.originalSubtitle}
          masteredSubtitle={articleSingle.masteredSubtitle}
        />
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <h3 style={headingStyle}>Hear the difference</h3>
      <p style={mutedText}>
        A real track, before and after.
        <br />
        No plugins. No studio time. Free to try.
      </p>

      <StaticBeforeAfterPair pairId="static-home-ab-edm" badgeLabel="EDM" originalSrc={EDM_ORIGINAL_SRC} masteredSrc={EDM_MASTERED_SRC} />

      <StaticBeforeAfterPair
        pairId="static-home-ab-reggaeton"
        pairEyebrow="Reggaeton example"
        badgeLabel="Reggaeton"
        originalSrc={REGGAETON_ORIGINAL_SRC}
        masteredSrc={REGGAETON_MASTERED_SRC}
      />

      <StaticBeforeAfterPair
        pairId="static-home-ab-hiphop"
        pairEyebrow="Hip hop example"
        badgeLabel="Hip Hop"
        originalSrc={HIPHOP_ORIGINAL_SRC}
        masteredSrc={HIPHOP_MASTERED_SRC}
      />
    </section>
  );
}

function dynamicHintStyle(active: boolean): CSSProperties {
  return {
    margin: "0 0 6px",
    fontSize: "0.7rem",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: active ? "rgba(220, 228, 255, 0.88)" : "rgba(120, 136, 178, 0.5)",
    opacity: active ? 1 : 0.72,
    transition: "color 220ms ease, opacity 220ms ease",
    fontWeight: 600,
    minHeight: "1.15em"
  };
}

const pairWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  minWidth: 0
};

const pairEyebrowStyle: React.CSSProperties = {
  margin: "10px 0 0",
  textAlign: "center",
  color: "#b4c0ea",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase"
};

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(165deg, rgba(19, 28, 52, 0.62), rgba(11, 18, 35, 0.62))",
  border: "1px solid rgba(98, 114, 170, 0.34)",
  borderRadius: "24px",
  padding: "22px",
  display: "grid",
  gap: "18px"
};

const articleEmbedPanelStyle: CSSProperties = {
  ...panelStyle,
  minWidth: 0,
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  isolation: "isolate",
  position: "relative"
};

const headingStyle: React.CSSProperties = {
  color: "#f1f5ff",
  margin: "0 0 8px 0",
  textAlign: "center",
  fontSize: "clamp(1.8rem, 3vw, 2.6rem)",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};
const mutedText: React.CSSProperties = {
  color: "#9aa8cf",
  margin: "0 0 18px 0",
  textAlign: "center",
  fontSize: "0.98rem",
  lineHeight: 1.5
};
const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  alignItems: "start",
  minWidth: 0
};
const cardStyle: React.CSSProperties = {
  position: "relative",
  borderRadius: "16px",
  border: "1px solid rgba(131, 145, 197, 0.26)",
  background: "rgba(10, 15, 28, 0.62)",
  padding: "14px"
};
const masteredCardStyle: React.CSSProperties = {
  position: "relative",
  borderRadius: "16px",
  border: "1px solid rgba(151, 116, 255, 0.4)",
  background: "linear-gradient(160deg, rgba(74, 42, 153, 0.22), rgba(10, 15, 28, 0.62))",
  padding: "14px"
};
const labelRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" };
const badgeStyle: React.CSSProperties = {
  borderRadius: "999px",
  border: "1px solid rgba(151, 116, 255, 0.55)",
  background: "rgba(101, 81, 173, 0.25)",
  color: "#d7c9ff",
  fontSize: "0.66rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "4px 8px"
};
const labelStyle: React.CSSProperties = { color: "#dbe2fe", margin: "0", fontWeight: 600 };
const masteredLabelStyle: React.CSSProperties = { color: "#c4b3ff", margin: "0", fontWeight: 700 };
const labelSubStyle: React.CSSProperties = { margin: "2px 0 4px", fontSize: "0.85rem", color: "#91a1cc" };
const hiddenAudioStyle: React.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
  opacity: 0,
  pointerEvents: "none"
};
const spectrumShellStyle: React.CSSProperties = {
  borderRadius: "10px",
  background: "rgba(21, 30, 53, 0.55)",
  border: "1px solid rgba(70, 84, 130, 0.28)",
  padding: "5px 6px",
  transition: "box-shadow 260ms ease, border-color 260ms ease, background 260ms ease"
};
const spectrumShellIdleStyle: React.CSSProperties = { boxShadow: "none" };
const spectrumShellActiveOriginalStyle: React.CSSProperties = {
  borderColor: "rgba(130, 148, 210, 0.55)",
  boxShadow: "0 0 0 1px rgba(130, 148, 210, 0.22), 0 10px 32px rgba(60, 78, 120, 0.28)",
  background: "rgba(24, 34, 58, 0.72)"
};
const spectrumShellActiveMasteredStyle: React.CSSProperties = {
  borderColor: "rgba(151, 116, 255, 0.52)",
  boxShadow: "0 0 0 1px rgba(151, 116, 255, 0.3), 0 12px 36px rgba(94, 72, 188, 0.35)",
  background: "rgba(34, 26, 58, 0.65)"
};
const cardTransitionStyle: React.CSSProperties = {
  transition: "border-color 240ms ease, box-shadow 280ms ease, background 260ms ease, transform 240ms ease"
};
const cardActiveRingOriginalStyle: React.CSSProperties = {
  boxShadow: "0 14px 36px rgba(52, 68, 115, 0.32)",
  transform: "translate3d(0, -1px, 0)"
};
const cardActiveRingMasteredStyle: React.CSSProperties = {
  boxShadow: "0 16px 42px rgba(88, 64, 168, 0.4)",
  transform: "translate3d(0, -1px, 0)"
};
const playButtonStyle: React.CSSProperties = {
  marginTop: "10px",
  width: "100%",
  borderRadius: "10px",
  border: "1px solid rgba(81, 97, 148, 0.52)",
  background: "rgba(14, 22, 39, 0.9)",
  color: "#e3e8ff",
  padding: "10px 12px",
  fontWeight: 700,
  transition: "box-shadow 140ms ease, transform 140ms ease"
};
const masteredPlayButtonStyle: React.CSSProperties = {
  ...playButtonStyle,
  background: "linear-gradient(125deg, #8b79ff 0%, #5e7dff 100%)",
  border: "1px solid rgba(151, 116, 255, 0.72)",
  color: "#fff"
};
const masteredPlayButtonActiveStyle: React.CSSProperties = {
  ...masteredPlayButtonStyle,
  boxShadow: "inset 0 0 0 1px rgba(173, 151, 255, 0.52), 0 10px 24px rgba(94, 90, 201, 0.38)",
  transform: "translate3d(0, -1px, 0)"
};
const timerRowStyle: React.CSSProperties = {
  marginTop: "8px",
  display: "flex",
  justifyContent: "space-between",
  gap: "6px",
  color: "#b6c2e8",
  fontSize: "0.82rem",
  fontVariantNumeric: "tabular-nums"
};
const timerSeparatorStyle: React.CSSProperties = { opacity: 0.65 };
const progressSliderWrapStyle: React.CSSProperties = { marginTop: "8px", width: "100%" };
const progressSliderStyle: React.CSSProperties = {
  appearance: "none",
  width: "100%",
  height: "10px",
  borderRadius: "999px",
  border: "1px solid rgba(102, 116, 170, 0.34)",
  cursor: "pointer",
  outline: "none"
};
const masteredProgressSliderStyle: React.CSSProperties = { ...progressSliderStyle, border: "1px solid rgba(136, 111, 221, 0.44)" };
