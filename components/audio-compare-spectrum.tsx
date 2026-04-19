"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

const BAR_COUNT = 34;
const IDLE_FLOOR = 0.06;

type CompareSpectrumProps = {
  analyserRef: MutableRefObject<AnalyserNode | null>;
  isActivePlaying: boolean;
  variant: "original" | "mastered";
};

export function CompareSpectrum({ analyserRef, isActivePlaying, variant }: CompareSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heightsRef = useRef(new Float32Array(BAR_COUNT));
  const rafRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const liveRef = useRef({ isActivePlaying, variant });
  liveRef.current = { isActivePlaying, variant };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx2d = canvas.getContext("2d", { alpha: true });
    if (!ctx2d) return;

    const pickBinRange = (barIndex: number, binCount: number) => {
      const t0 = barIndex / BAR_COUNT;
      const t1 = (barIndex + 1) / BAR_COUNT;
      const start = Math.floor(t0 ** 1.45 * binCount * 0.5);
      const end = Math.max(start + 1, Math.floor(t1 ** 1.45 * binCount * 0.5));
      return { start, end };
    };

    const draw = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const { isActivePlaying: playing, variant: v } = liveRef.current;
      const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
      const cssW = canvas.clientWidth || 280;
      const cssH = canvas.clientHeight || 52;
      if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const w = cssW;
      const h = cssH;
      const analyser = analyserRef.current;
      const binCount = analyser ? analyser.frequencyBinCount : 0;

      if (analyser && binCount > 0) {
        if (!dataRef.current || dataRef.current.length !== binCount) {
          dataRef.current = new Uint8Array(new ArrayBuffer(binCount)) as Uint8Array<ArrayBuffer>;
        }
        analyser.getByteFrequencyData(dataRef.current);
      }

      const data = dataRef.current;
      const target = new Float32Array(BAR_COUNT);
      const isMastered = v === "mastered";

      for (let i = 0; i < BAR_COUNT; i++) {
        if (playing && analyser && data) {
          const { start, end } = pickBinRange(i, binCount);
          let sum = 0;
          for (let j = start; j < end; j++) sum += data[j]!;
          let level = sum / (end - start) / 255;
          level = Math.max(0, Math.min(1, level));
          if (isMastered) {
            level = Math.min(1, level ** 0.88 * 1.05 + level * 0.04);
          } else {
            level = Math.min(1, level ** 1.06 * 0.96);
          }
          const lowMid = i < BAR_COUNT * 0.45 ? 1.04 : 1;
          level = Math.min(1, level * lowMid);
          target[i] = level;
        } else {
          target[i] = IDLE_FLOOR;
        }
      }

      const prev = heightsRef.current;
      const attack = playing ? 0.42 : 0.18;
      const release = playing ? 0.28 : 0.22;
      for (let i = 0; i < BAR_COUNT; i++) {
        const t = target[i]!;
        const p = prev[i]!;
        const k = t > p ? attack : release;
        prev[i] = p + (t - p) * k;
      }

      ctx2d.clearRect(0, 0, w, h);
      const padX = 5;
      const gap = 2;
      const usable = w - padX * 2;
      const bw = (usable - gap * (BAR_COUNT - 1)) / BAR_COUNT;
      const baseY = h - 4;

      for (let i = 0; i < BAR_COUNT; i++) {
        const x = padX + i * (bw + gap);
        const nh = Math.max(3, prev[i]! * (h - 10) * (isMastered ? 0.96 : 0.88));
        const y = baseY - nh;
        const r = Math.min(3, bw / 2);

        const g = ctx2d.createLinearGradient(x, baseY, x, y);
        if (isMastered) {
          g.addColorStop(0, "rgba(129, 92, 255, 0.55)");
          g.addColorStop(0.45, "rgba(142, 121, 255, 0.92)");
          g.addColorStop(1, "rgba(200, 210, 255, 0.98)");
        } else {
          g.addColorStop(0, "rgba(110, 124, 168, 0.45)");
          g.addColorStop(0.5, "rgba(150, 162, 200, 0.82)");
          g.addColorStop(1, "rgba(210, 218, 242, 0.9)");
        }

        ctx2d.fillStyle = g;
        ctx2d.beginPath();
        ctx2d.roundRect(x, y, bw, nh, r);
        ctx2d.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserRef]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={variant === "mastered" ? "Mastered spectrum" : "Original spectrum"}
      style={{
        display: "block",
        width: "100%",
        height: "52px",
        borderRadius: "10px",
        verticalAlign: "middle"
      }}
    />
  );
}
