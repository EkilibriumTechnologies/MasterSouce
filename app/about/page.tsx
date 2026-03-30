import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — MasterSauce",
  description:
    "MasterSauce is a small startup building smart mastering for independent artists, bedroom producers, and AI music creators."
};

export default function AboutPage() {
  return (
    <main style={mainStyle}>
      <nav style={topNavStyle} aria-label="Site">
        <Link href="/" style={backLinkStyle}>
          ← Back to MasterSauce
        </Link>
      </nav>

      <header style={heroStyle}>
        <p style={eyebrowStyle}>Built for modern music creators</p>
        <h1 style={h1Style}>About MasterSauce</h1>
        <p style={introStyle}>
          MasterSauce was born from a simple belief: independent creators deserve access to mastering that feels powerful,
          fast, and within reach.
        </p>
      </header>

      <article style={articleStyle}>
        <p style={pStyle}>
          As a founder and music creator myself, I know the feeling of working on a track for hours, sometimes days, trying
          to get it to the point where it finally sounds ready. For a lot of artists, bedroom producers, and AI creators,
          that last step can feel frustrating — too expensive, too technical, or too disconnected from the way music is
          actually being made today.
        </p>

        <p style={pullStyle} role="note">
          That is where MasterSauce comes in.
        </p>

        <p style={pStyle}>
          We are a small startup team building for modern creators with a practical, creator-first mindset. This is not a
          faceless platform built by people removed from the process. It is being shaped by people who understand the
          excitement, the doubt, and the obsession that come with trying to finish music that actually moves people.
        </p>

        <p style={pStyle}>
          MasterSauce is designed to help you take the next step with confidence: upload your track, hear the improvement,
          compare it in real time, and walk away with a stronger result that feels closer to release.
        </p>

        <p style={pStyle}>
          Just as important, we believe trust matters. Your audio is processed to create the mastered result and deliver it
          back to you. We are not building a long-term vault of your music. The focus is on helping creators get what they
          came for: a better-sounding track and a smoother path forward.
        </p>

        <p style={pStyle}>
          We are building MasterSauce in startup mode — lean, focused, and constantly improving through real feedback. Our
          mission is to make mastering more accessible, more direct, and more aligned with the next generation of music
          creators.
        </p>

        <p style={closingStyle}>
          If you are creating from your bedroom, from a laptop, from an idea, or from pure determination, you are in the right
          place.
        </p>
      </article>

      <section style={ctaSectionStyle} aria-labelledby="about-cta-heading">
        <h2 id="about-cta-heading" style={ctaHeadingStyle}>
          Ready to hear the difference?
        </h2>
        <p style={ctaBodyStyle}>
          Upload a track, preview the master, and see how it fits your workflow — built for creators who finish music on
          their own terms.
        </p>
        <div style={ctaRowStyle}>
          <Link href="/#master" style={ctaPrimaryStyle}>
            Try MasterSauce
          </Link>
        </div>
      </section>
    </main>
  );
}

const mainStyle: CSSProperties = {
  maxWidth: "860px",
  margin: "0 auto",
  padding: "28px clamp(20px, 4vw, 36px) 88px",
  color: "#eef2ff",
  fontFamily: "inherit",
  boxSizing: "border-box"
};

const topNavStyle: CSSProperties = {
  margin: "0 0 28px",
  padding: "0 2px"
};

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "44px",
  padding: "8px 10px 8px 4px",
  marginLeft: "-4px",
  fontFamily: "inherit",
  fontSize: "0.92rem",
  fontWeight: 600,
  textDecoration: "none",
  letterSpacing: "0.01em",
  color: "rgba(142, 160, 208, 0.88)"
};

const heroStyle: CSSProperties = {
  textAlign: "center",
  padding: "clamp(36px, 6vw, 52px) clamp(22px, 4vw, 40px)",
  marginBottom: "clamp(40px, 6vw, 56px)",
  borderRadius: "28px",
  border: "1px solid rgba(74, 90, 150, 0.22)",
  boxShadow: "0 24px 56px rgba(4, 7, 16, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
  background:
    "radial-gradient(800px 280px at 50% -20%, rgba(155, 111, 255, 0.28), rgba(155, 111, 255, 0) 60%), radial-gradient(700px 400px at 0% 0%, rgba(46, 177, 255, 0.1), rgba(46, 177, 255, 0) 58%), linear-gradient(145deg, #121a32 0%, #0d1428 52%, #090f1f 100%)"
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 16px",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#8eb4ff"
};

const h1Style: CSSProperties = {
  margin: "0 auto 18px",
  maxWidth: "18ch",
  fontSize: "clamp(2rem, 4.5vw, 2.75rem)",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: 1.12,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  color: "#f1f4ff"
};

const introStyle: CSSProperties = {
  margin: "0 auto",
  maxWidth: "52ch",
  fontSize: "1.0625rem",
  lineHeight: 1.68,
  color: "#9ca8cc"
};

const articleStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "22px",
  maxWidth: "52rem",
  margin: "0 auto"
};

const pStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.0625rem",
  lineHeight: 1.78,
  color: "#b9c2e6"
};

const pullStyle: CSSProperties = {
  margin: "6px 0",
  padding: "18px 22px",
  borderRadius: "16px",
  border: "1px solid rgba(106, 124, 255, 0.28)",
  borderLeftWidth: "4px",
  borderLeftColor: "rgba(143, 98, 255, 0.85)",
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.75), rgba(12, 17, 30, 0.82))",
  fontSize: "1.125rem",
  fontWeight: 600,
  lineHeight: 1.55,
  color: "#e4e9ff",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};

const closingStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "1.0625rem",
  lineHeight: 1.78,
  color: "#d0d8f0",
  fontWeight: 600
};

const ctaSectionStyle: CSSProperties = {
  marginTop: "clamp(48px, 8vw, 72px)",
  padding: "clamp(32px, 5vw, 44px) clamp(24px, 4vw, 36px)",
  textAlign: "center",
  borderRadius: "24px",
  border: "1px solid rgba(142, 155, 209, 0.2)",
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.94), rgba(12, 17, 30, 0.94))",
  boxShadow: "0 18px 40px rgba(2, 4, 12, 0.45)"
};

const ctaHeadingStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "clamp(1.5rem, 3vw, 1.85rem)",
  fontWeight: 700,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  color: "#f1f4ff",
  letterSpacing: "-0.02em"
};

const ctaBodyStyle: CSSProperties = {
  margin: "0 auto 24px",
  maxWidth: "42ch",
  fontSize: "1rem",
  lineHeight: 1.65,
  color: "#9ca8cc"
};

const ctaRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center"
};

const ctaPrimaryStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  borderRadius: "999px",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  boxShadow: "0 14px 36px rgba(121, 100, 255, 0.45)",
  color: "#ffffff",
  fontWeight: 700,
  padding: "15px 36px"
};
