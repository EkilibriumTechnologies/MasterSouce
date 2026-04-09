"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

type AudioCompareProps = {
  originalPreviewUrl: string;
  masteredPreviewUrl: string;
  originalLabel?: string;
  originalSubLabel?: string;
  masteredLabel?: string;
  masteredSubLabel?: string;
};

export function AudioCompare({
  originalPreviewUrl,
  masteredPreviewUrl,
  originalLabel = "Original",
  originalSubLabel = "Your uploaded track",
  masteredLabel = "Mastered",
  masteredSubLabel = "Enhanced by MasterSauce"
}: AudioCompareProps) {
  const originalRef = useRef<HTMLAudioElement>(null);
  const masteredRef = useRef<HTMLAudioElement>(null);
  const [activeSource, setActiveSource] = useState<"original" | "mastered">("original");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [masteredDuration, setMasteredDuration] = useState(0);

  useEffect(() => {
    originalRef.current?.pause();
    masteredRef.current?.pause();
    setActiveSource("original");
    setIsPlaying(false);
    setCurrentTime(0);
    setOriginalDuration(0);
    setMasteredDuration(0);
  }, [originalPreviewUrl, masteredPreviewUrl]);

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
  }

  function seekWithSlider(event: ChangeEvent<HTMLInputElement>, target: "original" | "mastered") {
    const ratio = Number(event.currentTarget.value) / 100;
    seekByRatio(Math.max(0, Math.min(1, ratio)), target);
  }

  async function playSource(target: "original" | "mastered") {
    const nextAudio = getAudio(target);
    const otherAudio = getAudio(target === "original" ? "mastered" : "original");
    if (!nextAudio) return;

    otherAudio?.pause();
    nextAudio.currentTime = Math.min(currentTime, getDuration(target) || currentTime);

    try {
      await nextAudio.play();
      setActiveSource(target);
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }

  function pauseActive() {
    const activeAudio = getAudio(activeSource);
    activeAudio?.pause();
    setIsPlaying(false);
  }

  return (
    <section style={panelStyle}>
      <h3 style={headingStyle}>Compare Before & After</h3>
      <p style={mutedText}>Preview your mastered track instantly - no master consumed</p>
      <div style={gridStyle}>
        <div style={activeSource === "original" ? masteredCardStyle : cardStyle}>
          <p style={labelStyle}>{originalLabel}</p>
          <p style={labelSubStyle}>{originalSubLabel}</p>
          <audio
            key={originalPreviewUrl}
            ref={originalRef}
            preload="auto"
            style={hiddenAudioStyle}
            src={originalPreviewUrl}
            onLoadedMetadata={(event) => setOriginalDuration(event.currentTarget.duration || 0)}
            onTimeUpdate={(event) => {
              if (activeSource !== "original") return;
              setCurrentTime(event.currentTarget.currentTime || 0);
            }}
            onEnded={() => {
              if (activeSource !== "original") return;
              setIsPlaying(false);
              setCurrentTime(0);
              syncTimeToBoth(0);
            }}
          />
          <div style={waveStyle}>
            {Array.from({ length: 30 }).map((_, i) => (
              <span
                key={`o-${i}`}
                style={{
                  ...(activeSource === "original" ? masteredBarStyle : barStyle),
                  height: `${8 + ((i * 7) % 34)}px`
                }}
              />
            ))}
          </div>
          <button
            type="button"
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
        <div style={activeSource === "mastered" ? masteredCardStyle : cardStyle}>
          <p style={masteredLabelStyle}>{masteredLabel}</p>
          <p style={labelSubStyle}>{masteredSubLabel}</p>
          <audio
            key={masteredPreviewUrl}
            ref={masteredRef}
            preload="auto"
            style={hiddenAudioStyle}
            src={masteredPreviewUrl}
            onLoadedMetadata={(event) => setMasteredDuration(event.currentTarget.duration || 0)}
            onTimeUpdate={(event) => {
              if (activeSource !== "mastered") return;
              setCurrentTime(event.currentTarget.currentTime || 0);
            }}
            onEnded={() => {
              if (activeSource !== "mastered") return;
              setIsPlaying(false);
              setCurrentTime(0);
              syncTimeToBoth(0);
            }}
          />
          <div style={waveStyle}>
            {Array.from({ length: 30 }).map((_, i) => (
              <span
                key={`m-${i}`}
                style={{
                  ...(activeSource === "mastered" ? masteredBarStyle : barStyle),
                  height: `${12 + ((i * 9) % 38)}px`
                }}
              />
            ))}
          </div>
          <button
            type="button"
            style={
              activeSource === "mastered"
                ? masteredIsPlaying
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
      <p style={footNoteStyle}>Preview is completely free - enter email only to export the final master</p>
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
  margin: "2px 0 10px",
  fontSize: "0.85rem",
  color: "#91a1cc"
};
const hiddenAudioStyle: React.CSSProperties = {
  display: "none"
};
const waveStyle: React.CSSProperties = {
  height: "64px",
  borderRadius: "10px",
  background: "rgba(21, 30, 53, 0.7)",
  border: "1px solid rgba(70, 84, 130, 0.3)",
  display: "flex",
  alignItems: "flex-end",
  gap: "3px",
  padding: "8px 10px",
  overflow: "hidden"
};
const barStyle: React.CSSProperties = {
  width: "4px",
  borderRadius: "4px",
  background: "rgba(166, 176, 207, 0.7)"
};
const masteredBarStyle: React.CSSProperties = {
  ...barStyle,
  background: "linear-gradient(to top, #815cff, #7283ff)"
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
const footNoteStyle: React.CSSProperties = {
  margin: "14px 0 0",
  textAlign: "center",
  color: "#8a97bf",
  fontSize: "0.85rem"
};
