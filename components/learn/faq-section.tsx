import type { CSSProperties } from "react";

import type { FaqItem } from "@/components/seo/faq-schema";

const faqSectionStyle: CSSProperties = {
  marginTop: "clamp(40px, 7vw, 64px)"
};

const faqTitleStyle: CSSProperties = {
  margin: "0 0 16px",
  fontSize: "clamp(1.35rem, 2.5vw, 1.65rem)",
  fontWeight: 700,
  color: "#f1f4ff",
  letterSpacing: "-0.02em",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};

const faqListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px"
};

const faqItemStyle: CSSProperties = {
  borderRadius: "14px",
  border: "1px solid rgba(74, 90, 150, 0.3)",
  background: "linear-gradient(155deg, rgba(19, 28, 52, 0.62), rgba(12, 19, 37, 0.72))",
  padding: "12px 14px"
};

const faqQuestionStyle: CSSProperties = {
  cursor: "pointer",
  color: "#e8ecff",
  fontWeight: 600,
  lineHeight: 1.45
};

const faqAnswerStyle: CSSProperties = {
  margin: "10px 2px 4px",
  color: "#b9c2e6",
  lineHeight: 1.7,
  fontSize: "1rem"
};

type FaqSectionProps = {
  items: FaqItem[];
};

export function FaqSection({ items }: FaqSectionProps) {
  if (!items.length) return null;

  return (
    <section style={faqSectionStyle} aria-labelledby="faq-heading">
      <h2 id="faq-heading" style={faqTitleStyle}>
        Frequently Asked Questions
      </h2>
      <div style={faqListStyle}>
        {items.map((item) => (
          <details key={item.question} style={faqItemStyle}>
            <summary style={faqQuestionStyle}>{item.question}</summary>
            <p style={faqAnswerStyle}>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
