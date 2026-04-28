"use client";

import { ChangeEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { CompareSpectrum } from "@/components/audio-compare-spectrum";
import { trackAbEvent, type AbVersion } from "@/lib/analytics/ab-comparison";

type AudioCompareProps = {
  originalPreviewUrl: string;
  masteredPreviewUrl: string;
  originalLabel?: string;
  originalSubLabel?: string;
  masteredLabel?: string;
  masteredSubLabel?: string;
  /** Rendered after the two comparison cards (players), before the section footnote — e.g. primary export CTA. */
  afterCompare?: ReactNode;
  analyticsContext?: {
    trackId?: string;
    jobId?: string;
    fileId?: string;
    sessionId?: string;
    planId?: string;
  };
};

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

export function AudioCompare({
  originalPreviewUrl,
  masteredPreviewUrl,
  originalLabel = "Original",
  originalSubLabel = "Your uploaded track",
  masteredLabel = "Mastered",
  masteredSubLabel = "Balanced for streaming playback",
  afterCompare,
  analyticsContext
}: AudioCompareProps) {
  const originalRef = useRef<HTMLAudioElement>(null);
  const masteredRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const originalAnalyserRef = useRef<AnalyserNode | null>(null);
  const masteredAnalyserRef = useRef<AnalyserNode | null>(null);
  /** Tracks which preview URL pair the current MediaElementSource graph belongs to (Strict Mode safe). */
  const wiredUrlPairRef = useRef<string | null>(null);
  const [activeSource, setActiveSource] = useState<"original" | "mastered">("original");
  const activeSourceRef = useRef<"original" | "mastered">("original");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [masteredDuration, setMasteredDuration] = useState(0);
  const progressMilestonesRef = useRef<Record<AbVersion, Set<number>>>({
    original: new Set<number>(),
    mastered: new Set<number>()
  });

  useEffect(() => {
    originalRef.current?.pause();
    masteredRef.current?.pause();
    setActiveSource("original");
    activeSourceRef.current = "original";
    setIsPlaying(false);
    setCurrentTime(0);
    setOriginalDuration(0);
    setMasteredDuration(0);
    progressMilestonesRef.current.original.clear();
    progressMilestonesRef.current.mastered.clear();
  }, [originalPreviewUrl, masteredPreviewUrl]);

  useLayoutEffect(() => {
    activeSourceRef.current = activeSource;
  }, [activeSource]);

  /**
   * Web Audio must not be wired in a mount-only `useEffect`: React Strict Mode runs that effect twice on the same
   * `<audio>` DOM nodes; the second `createMediaElementSource` throws, the catch clears the context, and the
   * elements stay bound to a closed graph so `play()` never advances. Wiring once from `playSource` (user gesture)
   * avoids the double-invoke path entirely.
   */
  useEffect(() => {
    return () => {
      wiredUrlPairRef.current = null;
      originalAnalyserRef.current = null;
      masteredAnalyserRef.current = null;
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, [originalPreviewUrl, masteredPreviewUrl]);

  function urlPairKey(): string {
    return `${originalPreviewUrl}\n${masteredPreviewUrl}`;
  }

  function ensureWebAudioGraph(): void {
    if (typeof window === "undefined") return;
    if (!originalPreviewUrl || !masteredPreviewUrl) return;

    const pair = urlPairKey();
    const existing = audioContextRef.current;
    if (wiredUrlPairRef.current === pair && existing && existing.state !== "closed") return;

    const originalEl = originalRef.current;
    const masteredEl = masteredRef.current;
    if (!originalEl || !masteredEl) return;

    const prev = audioContextRef.current;
    if (prev && prev.state !== "closed") void prev.close();
    audioContextRef.current = null;
    originalAnalyserRef.current = null;
    masteredAnalyserRef.current = null;
    wiredUrlPairRef.current = null;

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
      wiredUrlPairRef.current = pair;
    } catch {
      wiredUrlPairRef.current = null;
      originalAnalyserRef.current = null;
      masteredAnalyserRef.current = null;
      audioContextRef.current = null;
      void ctx.close();
    }
  }

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const floored = Math.floor(seconds);
    const mins = Math.floor(floored / 60);
    const secs = floored % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function getAudio(target: "original" | "mastered") {
    return target === "original" ? originalRef.current : masteredRef.current;
  }

  function getDuration(target: "original" | "mastered") {
    return target === "original" ? originalDuration : masteredDuration;
  }

  const sharedDuration = Math.max(
    getDuration(activeSource),
    getDuration(activeSource === "original" ? "mastered" : "original")
  );
  const sharedProgress = sharedDuration > 0 ? (currentTime / sharedDuration) * 100 : 0;
  const originalIsPlaying = activeSource === "original" && isPlaying;
  const masteredIsPlaying = activeSource === "mastered" && isPlaying;

  function syncTimeToBoth(timeInSec: number) {
    const original = originalRef.current;
    const mastered = masteredRef.current;
    if (original) original.currentTime = Math.min(timeInSec, originalDuration || timeInSec);
    if (mastered) mastered.currentTime = Math.min(timeInSec, masteredDuration || timeInSec);
  }

  function seekByRatio(ratio: number, target: "original" | "mastered") {
    const targetDuration = getDuration(target);
    if (!targetDuration) return;
    const nextTime = ratio * targetDuration;
    syncTimeToBoth(nextTime);
    setCurrentTime(nextTime);
    setActiveSource(target);
    activeSourceRef.current = target;
    trackAbEvent("ab_seek", baseAnalyticsParams(target, nextTime, targetDuration));
  }

  function seekWithSlider(event: ChangeEvent<HTMLInputElement>, target: "original" | "mastered") {
    const ratio = Number(event.currentTarget.value) / 100;
    seekByRatio(Math.max(0, Math.min(1, ratio)), target);
  }

  function baseAnalyticsParams(version: AbVersion, position: number, duration: number) {
    const percent = duration > 0 ? (position / duration) * 100 : 0;
    return {
      version,
      track_id: analyticsContext?.trackId,
      job_id: analyticsContext?.jobId,
      file_id: analyticsContext?.fileId,
      session_id: analyticsContext?.sessionId,
      plan_id: analyticsContext?.planId,
      playback_position_seconds: Number(position.toFixed(2)),
      playback_percent: Number(Math.max(0, Math.min(100, percent)).toFixed(1))
    };
  }

  function trackProgressMilestones(version: AbVersion, position: number, duration: number) {
    if (duration <= 0) return;
    const currentPercent = (position / duration) * 100;
    const milestones = [25, 50, 75, 100] as const;
    milestones.forEach((milestone) => {
      if (currentPercent < milestone) return;
      if (progressMilestonesRef.current[version].has(milestone)) return;
      progressMilestonesRef.current[version].add(milestone);
      trackAbEvent(version === "original" ? "ab_original_progress" : "ab_mastered_progress", {
        ...baseAnalyticsParams(version, position, duration),
        playback_percent: milestone
      });
    });
  }

  async function playSource(target: "original" | "mastered") {
    const previousSource = activeSourceRef.current;
    const nextAudio = getAudio(target);
    const otherAudio = getAudio(target === "original" ? "mastered" : "original");
    if (!nextAudio) return;

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

    nextAudio.currentTime = Math.min(currentTime, getDuration(target) || currentTime);

    try {
      await nextAudio.play();
      setIsPlaying(true);
      const params = baseAnalyticsParams(target, nextAudio.currentTime || currentTime, getDuration(target));
      trackAbEvent(target === "original" ? "ab_original_play" : "ab_mastered_play", params);
      if (previousSource !== target) {
        trackAbEvent(target === "mastered" ? "ab_switch_to_mastered" : "ab_switch_to_original", params);
      }
    } catch {
      setIsPlaying(false);
    }
  }

  function pauseActive() {
    const activeAudio = getAudio(activeSource);
    const version = activeSource;
    const pausedPosition = activeAudio?.currentTime ?? currentTime;
    const duration = getDuration(version);
    activeAudio?.pause();
    setIsPlaying(false);
    trackAbEvent(
      version === "original" ? "ab_original_pause" : "ab_mastered_pause",
      baseAnalyticsParams(version, pausedPosition, duration)
    );
  }

  const hintOriginal = "Your mix as uploaded";
  const hintMastered = "More clarity, level, and punch";

  return (
    <section style={activeSource === "mastered" ? { ...panelStyle, ...panelMasteredGlowStyle } : panelStyle}>
      <h3 style={headingStyle}>Hear the difference before you pay</h3>
      <p style={mutedText}>
        Flip between your upload and the master — unlimited playback while you decide. Nothing counts toward your plan until
        you download the final file.
      </p>
      <div style={comparePlayerRegionStyle}>
        <div style={gridStyle}>
        <div
          style={{
            ...(activeSource === "original" ? masteredCardStyle : cardStyle),
            ...cardTransitionStyle,
            ...(activeSource === "original" ? cardActiveRingOriginalStyle : null)
          }}
        >
          <p style={labelStyle}>{originalLabel}</p>
          <p style={labelSubStyle}>{originalSubLabel}</p>
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
            key={originalPreviewUrl}
            ref={originalRef}
            preload="auto"
            style={hiddenAudioStyle}
            src={originalPreviewUrl}
            onLoadedMetadata={(event) => setOriginalDuration(event.currentTarget.duration || 0)}
            onTimeUpdate={(event) => {
              if (activeSourceRef.current !== "original") return;
              const position = event.currentTarget.currentTime || 0;
              const duration = event.currentTarget.duration || 0;
              setCurrentTime(position);
              trackProgressMilestones("original", position, duration);
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
            data-analytics-id="ab-original-play"
            data-analytics-version="original"
            style={
              activeSource === "original"
                ? originalIsPlaying
                  ? masteredPlayButtonActiveStyle
                  : masteredPlayButtonStyle
                : originalIsPlaying
                  ? playButtonActiveStyle
                  : playButtonStyle
            }
            onClick={() => {
              if (activeSource === "original" && isPlaying) {
                pauseActive();
                return;
              }
              if (activeSource !== "original") {
                trackAbEvent("ab_toggle_clicked", baseAnalyticsParams("original", currentTime, sharedDuration));
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
          data-analytics-id="ab-mastered-play"
          data-analytics-version="mastered"
          style={{
            ...(activeSource === "mastered" ? masteredCardStyle : cardStyle),
            ...cardTransitionStyle,
            ...(activeSource === "mastered" ? cardActiveRingMasteredStyle : null)
          }}
        >
          <p style={masteredLabelStyle}>{masteredLabel}</p>
          <p style={labelSubStyle}>{masteredSubLabel}</p>
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
            key={masteredPreviewUrl}
            ref={masteredRef}
            preload="auto"
            style={hiddenAudioStyle}
            src={masteredPreviewUrl}
            onLoadedMetadata={(event) => setMasteredDuration(event.currentTarget.duration || 0)}
            onTimeUpdate={(event) => {
              if (activeSourceRef.current !== "mastered") return;
              const position = event.currentTarget.currentTime || 0;
              const duration = event.currentTarget.duration || 0;
              setCurrentTime(position);
              trackProgressMilestones("mastered", position, duration);
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
            data-analytics-id="ab-toggle"
            data-analytics-version={activeSource === "original" ? "mastered" : "original"}
            style={
              activeSource === "mastered"
                ? masteredIsPlaying
                  ? masteredPlayButtonActiveStyle
                  : masteredPlayButtonStyle
                : playButtonStyle
            }
            onClick={() => {
              const nextSource = activeSource === "original" ? "mastered" : "original";
              trackAbEvent("ab_toggle_clicked", baseAnalyticsParams(nextSource, currentTime, sharedDuration));
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
      {afterCompare ? <div style={afterCompareSlotStyle}>{afterCompare}</div> : null}
      <p style={footNoteStyle}>A/B previews never touch your quota — we only ask for email when you export the final WAV.</p>
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(165deg, rgba(19, 28, 52, 0.62), rgba(11, 18, 35, 0.62))",
  border: "1px solid rgba(98, 114, 170, 0.34)",
  borderRadius: "24px",
  padding: "22px"
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

/** Keeps play/seek controls above DistroKid / export slot when shadows or subpixel layout visually overlap. */
const comparePlayerRegionStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  isolation: "isolate"
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
};
const cardStyle: React.CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(131, 145, 197, 0.26)",
  background: "rgba(10, 15, 28, 0.62)",
  padding: "14px"
};
const masteredCardStyle: React.CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(151, 116, 255, 0.4)",
  background: "linear-gradient(160deg, rgba(74, 42, 153, 0.22), rgba(10, 15, 28, 0.62))",
  padding: "14px"
};

const labelStyle: React.CSSProperties = {
  color: "#dbe2fe",
  margin: "0",
  fontWeight: 600
};
const masteredLabelStyle: React.CSSProperties = {
  color: "#c4b3ff",
  margin: "0",
  fontWeight: 700
};
const labelSubStyle: React.CSSProperties = {
  margin: "2px 0 4px",
  fontSize: "0.85rem",
  color: "#91a1cc"
};
/** Avoid `display: none` — Chrome often stalls `<audio>` piped through Web Audio when the element is not rendered. */
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
const spectrumShellIdleStyle: React.CSSProperties = {
  boxShadow: "none"
};
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
  transform: "translateY(-1px)"
};
const cardActiveRingMasteredStyle: React.CSSProperties = {
  boxShadow: "0 16px 42px rgba(88, 64, 168, 0.4)",
  transform: "translateY(-1px)"
};
const panelMasteredGlowStyle: React.CSSProperties = {
  borderColor: "rgba(124, 98, 210, 0.42)",
  boxShadow: "0 18px 48px rgba(38, 24, 72, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.04)"
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
const playButtonActiveStyle: React.CSSProperties = {
  ...playButtonStyle,
  boxShadow: "inset 0 0 0 1px rgba(153, 168, 215, 0.4), 0 8px 18px rgba(52, 68, 113, 0.35)",
  transform: "translateY(-1px)"
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
const progressSliderWrapStyle: React.CSSProperties = {
  marginTop: "8px",
  width: "100%"
};
const progressSliderStyle: React.CSSProperties = {
  appearance: "none",
  width: "100%",
  height: "10px",
  borderRadius: "999px",
  border: "1px solid rgba(102, 116, 170, 0.34)",
  cursor: "pointer",
  outline: "none"
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
  transform: "translateY(-1px)"
};
const masteredProgressSliderStyle: React.CSSProperties = {
  ...progressSliderStyle,
  border: "1px solid rgba(136, 111, 221, 0.44)"
};
const afterCompareSlotStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  marginTop: "clamp(24px, 3.5vw, 36px)",
  marginBottom: "4px",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center"
};

const footNoteStyle: React.CSSProperties = {
  margin: "14px 0 0",
  textAlign: "center",
  color: "#8a97bf",
  fontSize: "0.85rem"
};
