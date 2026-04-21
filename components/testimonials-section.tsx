"use client";
import React, { useState } from "react";

const testimonials = [
  {
    name: "James T.",
    location: "Austin, USA",
    genre: "Hip-Hop",
    lang: "en",
    quote:
      "I've tried a few online mastering tools before, but this one gave my track more clarity, punch, and balance without destroying the vibe. The low end felt tighter, the vocals sat better, and it finally sounded ready for release."
  },
  {
    name: "Daniel R.",
    location: "Miami, USA",
    genre: "Pop",
    lang: "en",
    quote:
      "What I liked most was that the mastering improved the sound without making it feel overprocessed. It sounded cleaner, louder, and much more professional right away."
  },
  {
    name: "Carlos M.",
    location: "San Juan, Puerto Rico",
    genre: "Reggaeton",
    lang: "es",
    quote:
      "Probé la masterización y se notó rápido la diferencia. La canción sonó más clara, con más fuerza y mejor balanceada. Lo mejor fue que no perdió su esencia."
  },
  {
    name: "Javier L.",
    location: "Madrid, Spain",
    genre: "Latin Pop",
    lang: "es",
    quote:
      "Este servicio le dio a mi tema ese acabado final que le faltaba. Más presencia, más claridad y un sonido mucho más listo para lanzar en plataformas."
  },
  {
    name: "Lukas M.",
    location: "Berlin, Germany",
    genre: "Electronic",
    lang: "de",
    quote:
      "Ich war ehrlich überrascht, wie viel sauberer und stärker mein Track nach dem Mastering klang. Der Bass war kontrollierter, die Höhen klarer und insgesamt wirkte alles deutlich professioneller, ohne den Charakter des Songs zu verlieren."
  },
  {
    name: "Tobias K.",
    location: "Hamburg, Germany",
    genre: "EDM",
    lang: "de",
    quote:
      "Das Mastering hat meinem Song genau den letzten Feinschliff gegeben, der noch gefehlt hat. Mehr Klarheit, mehr Druck und ein ausgewogenerer Sound. Perfekt, wenn man einen Track veröffentlichen will."
  },
  {
    name: "Marco R.",
    location: "Milan, Italy",
    genre: "House",
    lang: "it",
    quote:
      "Sono rimasto davvero colpito dal risultato del mastering. Il brano suona più pulito, più potente e molto più professionale, ma senza perdere la sua identità. Adesso sembra finalmente pronto per essere pubblicato."
  },
  {
    name: "Alessandro F.",
    location: "Rome, Italy",
    genre: "R&B",
    lang: "it",
    quote:
      "Questo mastering ha dato al mio pezzo quel tocco finale che mancava. Più chiarezza, più impatto e un suono molto più equilibrato. Si sente subito che è pronto per l'uscita."
  }
];

const VISIBLE = 3;

export function TestimonialsSection() {
  const [start, setStart] = useState(0);
  const visible = testimonials.slice(start, start + VISIBLE);
  const canPrev = start > 0;
  const canNext = start + VISIBLE < testimonials.length;

  return (
    <section style={sectionStyle}>
      <h2 style={titleStyle}>What creators are saying</h2>
      <p style={subtitleStyle}>
        From bedroom producers to release-ready artists — across genres and
        languages.
      </p>
      <div style={gridStyle}>
        {visible.map((t) => (
          <div key={t.name} style={cardStyle}>
            <p style={quoteStyle}>"{t.quote}"</p>
            <div style={footerStyle}>
              <span style={nameStyle}>{t.name}</span>
              <span style={metaStyle}>
                {t.location} · {t.genre}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={navStyle}>
        <button
          style={navBtnStyle(canPrev)}
          onClick={() => setStart((s) => Math.max(0, s - VISIBLE))}
          disabled={!canPrev}
        >
          ← Previous
        </button>
        <button
          style={navBtnStyle(canNext)}
          onClick={() =>
            setStart((s) => Math.min(testimonials.length - VISIBLE, s + VISIBLE))
          }
          disabled={!canNext}
        >
          Next →
        </button>
      </div>
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: "48px 24px",
  textAlign: "center"
};
const titleStyle: React.CSSProperties = {
  fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
  color: "#f1f4ff",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  marginBottom: "8px"
};
const subtitleStyle: React.CSSProperties = {
  color: "#8ea2d8",
  fontSize: "0.95rem",
  marginBottom: "32px"
};
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "16px",
  maxWidth: "960px",
  margin: "0 auto"
};
const cardStyle: React.CSSProperties = {
  background:
    "linear-gradient(145deg, rgba(22, 29, 48, 0.94), rgba(12, 17, 30, 0.94))",
  border: "1px solid rgba(142, 155, 209, 0.2)",
  borderRadius: "16px",
  padding: "24px",
  textAlign: "left",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: "16px"
};
const quoteStyle: React.CSSProperties = {
  color: "#c6d2f5",
  lineHeight: 1.65,
  fontSize: "0.92rem",
  margin: 0
};
const footerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px"
};
const nameStyle: React.CSSProperties = {
  color: "#e8eeff",
  fontWeight: 700,
  fontSize: "0.9rem"
};
const metaStyle: React.CSSProperties = {
  color: "#6a7caa",
  fontSize: "0.8rem"
};
const navStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: "12px",
  marginTop: "24px"
};
const navBtnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(143, 98, 255, 0.2)" : "rgba(255,255,255,0.04)",
  border: `1px solid ${
    active ? "rgba(143, 98, 255, 0.4)" : "rgba(255,255,255,0.08)"
  }`,
  borderRadius: "8px",
  color: active ? "#c4b8ff" : "#4a5270",
  fontWeight: 600,
  fontSize: "0.85rem",
  padding: "8px 18px",
  cursor: active ? "pointer" : "default"
});
