"use client";

import { JOURNEY_STAGES, getJourneyStageIndex, type JourneyStageId } from "@/lib/journeys/stages";

export function JourneyProgress({ currentStage }: { currentStage: JourneyStageId }) {
  const currentIndex = getJourneyStageIndex(currentStage);

  return (
    <ol
      aria-label="Song Journey"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
        gap: 8,
        margin: 0,
        padding: 0,
        listStyle: "none"
      }}
    >
      {JOURNEY_STAGES.filter((stage) => stage.id !== "complete").map((stage, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={stage.id}
            aria-current={active ? "step" : undefined}
            style={{
              border: active
                ? "1px solid rgba(52, 211, 153, 0.7)"
                : "1px solid rgba(255,255,255,0.10)",
              borderRadius: 14,
              padding: "10px 12px",
              background: active
                ? "rgba(16,185,129,0.12)"
                : complete
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(255,255,255,0.025)",
              minHeight: 64
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: complete || active ? "#6ee7b7" : "rgba(255,255,255,0.42)"
              }}
            >
              {complete ? "Done" : active ? "Now" : `Step ${index + 1}`}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>{stage.label}</div>
          </li>
        );
      })}
    </ol>
  );
}
