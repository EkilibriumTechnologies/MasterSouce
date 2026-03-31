import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";

import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { LEGAL_CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Contact",
  description:
    "Reach the MasterSauce team for account questions, privacy requests, or general inquiries. We read every message.",
  path: "/contact"
});

export default function ContactPage() {
  return (
    <main style={mainStyle}>
      <nav style={topNavStyle} aria-label="Site">
        <Link href="/" style={backLinkStyle}>
          ← Back to MasterSauce
        </Link>
      </nav>

      <header style={heroStyle}>
        <p style={eyebrowStyle}>We are here to help</p>
        <h1 style={h1Style}>Contact</h1>
        <p style={introStyle}>
          For privacy rights requests, billing questions, or anything else about MasterSauce, email us directly. We aim to
          respond as soon as we can.
        </p>
      </header>

      <section style={cardStyle} aria-labelledby="contact-methods">
        <h2 id="contact-methods" style={h2Style}>
          Email
        </h2>
        <p style={pStyle}>
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={linkStyle}>
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
        <p style={mutedStyle}>
          Please include a clear subject line and the email associated with your account or purchase if relevant.
        </p>
      </section>

      <p style={footerHintStyle}>
        Legal terms and privacy details are in our{" "}
        <Link href="/terms" style={inlineLinkStyle}>
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" style={inlineLinkStyle}>
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}

const mainStyle: CSSProperties = {
  maxWidth: "640px",
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
  padding: "clamp(28px, 5vw, 40px) clamp(20px, 4vw, 32px)",
  marginBottom: "32px",
  borderRadius: "28px",
  border: "1px solid rgba(74, 90, 150, 0.22)",
  boxShadow: "0 24px 56px rgba(4, 7, 16, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
  background:
    "radial-gradient(800px 280px at 50% -20%, rgba(155, 111, 255, 0.28), rgba(155, 111, 255, 0) 60%), radial-gradient(700px 400px at 0% 0%, rgba(46, 177, 255, 0.1), rgba(46, 177, 255, 0) 58%), linear-gradient(145deg, #121a32 0%, #0d1428 52%, #090f1f 100%)"
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#8eb4ff"
};

const h1Style: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "clamp(1.85rem, 4vw, 2.5rem)",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: 1.12,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  color: "#f1f4ff"
};

const introStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.05rem",
  lineHeight: 1.68,
  color: "#9ca8cc"
};

const cardStyle: CSSProperties = {
  padding: "24px 22px",
  borderRadius: "20px",
  border: "1px solid rgba(142, 155, 209, 0.2)",
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.94), rgba(12, 17, 30, 0.94))",
  boxShadow: "0 18px 40px rgba(2, 4, 12, 0.45)"
};

const h2Style: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "1.25rem",
  fontWeight: 700,
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  color: "#f1f4ff"
};

const pStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "1.05rem",
  lineHeight: 1.6
};

const linkStyle: CSSProperties = {
  color: "#c8d4ff",
  fontWeight: 600,
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  wordBreak: "break-all"
};

const mutedStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.94rem",
  lineHeight: 1.6,
  color: "#8794bc"
};

const footerHintStyle: CSSProperties = {
  marginTop: "28px",
  fontSize: "0.9rem",
  lineHeight: 1.6,
  color: "#7f8aac",
  textAlign: "center"
};

const inlineLinkStyle: CSSProperties = {
  color: "#b2c0f0",
  textDecoration: "underline",
  textUnderlineOffset: "3px"
};
