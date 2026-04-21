import type { Metadata } from "next";
import "./home-hero-mobile.css";
import Image from "next/image";
import Link from "next/link";
import { HeroStatsBar } from "@/components/hero/HeroStatsBar";
import { PricingSection } from "@/components/pricing-section";
import { JsonLd } from "@/components/seo/json-ld";
import { UploadForm } from "@/components/upload-form";
import { TestimonialsSection } from "@/components/testimonials-section";
import { getHomeProductMetrics } from "@/lib/product-metrics";
import { HOME_FAQ_ITEMS } from "@/lib/seo/home-faq";
import { MobileMasterBanner } from "@/components/mobile-master-banner";
import { getHomePageJsonLdGraph } from "@/lib/seo/home-json-ld";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { SOCIAL_PREVIEW_ALT, SOCIAL_PREVIEW_SIZE } from "@/lib/og/social-preview";

type HomePageProps = {
  searchParams?: {
    checkout?: string | string[];
    kind?: string | string[];
  };
};

function getFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const metadata: Metadata = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: absoluteUrl("/og-image.png"),
        width: SOCIAL_PREVIEW_SIZE.width,
        height: SOCIAL_PREVIEW_SIZE.height,
        alt: SOCIAL_PREVIEW_ALT
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [absoluteUrl("/og-image.png")]
  }
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const checkout = getFirst(searchParams?.checkout);
  const kind = getFirst(searchParams?.kind);
  const showCheckoutSuccess = checkout === "success";
  const checkoutSuccessMessage =
    kind === "credit_pack" ? "Your credit pack was added successfully." : "Your plan is now active.";
  const homeProductMetrics = await getHomeProductMetrics();

  return (
    <>
      <JsonLd data={getHomePageJsonLdGraph()} />
      <main style={mainStyle}>
      <nav aria-label="Primary" style={topNavStyle}>
        <div style={topNavBrandWrap}>
          <span style={topNavBrandMark}>♫</span>
          <span style={topNavBrandText}>MasterSauce</span>
        </div>
        <div style={topNavLinksWrap}>
          <Link href="/learn" style={topNavLinkStyle}>
            Learn
          </Link>
          <Link href="/song-architect" style={topNavLinkStyle}>
            Song Architect
          </Link>
          <a href="#pricing" style={topNavLinkStyle}>
            Pricing
          </a>
        </div>
      </nav>
      {showCheckoutSuccess ? (
        <section style={successBannerStyle} aria-live="polite">
          <p style={successEyebrowStyle}>Purchase complete</p>
          <p style={successBodyStyle}>{checkoutSuccessMessage}</p>
        </section>
      ) : null}
      <section className="home-hero" style={heroStyle}>
        <div className="home-hero-logo-wrap" style={heroLogoWrap}>
          <Image
            src="/mastersauce-logo.png"
            alt="MasterSauce logo"
            width={466}
            height={381}
            priority
            className="home-hero-logo"
            sizes="(max-width: 639px) min(168px, 86vw), (max-width: 1024px) 260px, 320px"
            style={heroLogoImgStyle}
          />
        </div>
        <h1 style={h1Style}>Your track sounds finished today — not almost ready.</h1>
        <p style={subStyle}>
          Upload your mix, hear a real before/after preview, and export a release-ready master — no plugins, no chains,
          no expensive revisions.
        </p>
        <div style={platformRowStyle} aria-label="Streaming platform optimization">
          <span style={platformLabelStyle}>Optimized for:</span>
          <span style={platformIconsWrapStyle} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" role="img">
              <title>Spotify</title>
              <circle cx="12" cy="12" r="12" fill="#1DB954" />
              <path d="M6.6 10.3c3.6-1.1 7.5-.8 10.7.9" stroke="#0B0F16" strokeWidth="1.6" strokeLinecap="round" fill="none" />
              <path d="M7.2 13c2.8-.8 5.8-.6 8.2.7" stroke="#0B0F16" strokeWidth="1.4" strokeLinecap="round" fill="none" />
              <path d="M7.8 15.5c2.1-.5 4.3-.4 6.1.5" stroke="#0B0F16" strokeWidth="1.3" strokeLinecap="round" fill="none" />
            </svg>
            <svg viewBox="0 0 24 24" width="26" height="26" role="img">
              <title>Apple Music</title>
              <defs>
                <linearGradient id="appleMusicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FA233B" />
                  <stop offset="100%" stopColor="#FB5C74" />
                </linearGradient>
              </defs>
              <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#appleMusicGrad)" />
              <path d="M14.6 5.8v8.4a2.1 2.1 0 1 1-1.1-1.9V7.6l5-1.1v7.1a2.1 2.1 0 1 1-1.1-1.9V5.8z" fill="#FFFFFF" />
            </svg>
            <svg viewBox="0 0 24 24" width="26" height="26" role="img">
              <title>YouTube Music</title>
              <circle cx="12" cy="12" r="12" fill="#FF0033" />
              <circle cx="12" cy="12" r="7.2" fill="none" stroke="#FFFFFF" strokeWidth="1.6" />
              <polygon points="11,8.8 15.4,12 11,15.2" fill="#FFFFFF" />
            </svg>
          </span>
        </div>
        <div style={heroCtaRow}>
          <a href="#master" style={ctaPrimaryStyle}>
            Start mastering
          </a>
        </div>
        <HeroStatsBar metrics={homeProductMetrics} className="home-hero-stats" />
        <style>{`
          .home-hero-stats {
            padding: 20px 18px !important;
          }
          .home-hero-stats > div {
            padding: 12px 14px !important;
          }
          .home-hero-stats > div > p:first-child { font-size: 2rem !important; font-weight: 700 !important; }
          .home-hero-stats > div > p:last-child { font-size: 0.85rem !important; letter-spacing: normal !important; text-transform: none !important; }
        `}</style>

        <div style={pillRowStyle}>
          <span style={pillStyle}>⚡ Minutes, not studio turnaround</span>
          <span style={pillStyle}>🎧 Hear the lift before you export</span>
          <span style={pillStyle}>✉️ Preview first. Email only when you're ready to export.</span>
        </div>
      </section>

      <section id="what-is-mastersauce" style={sectionStyle} aria-labelledby="what-heading">
        <h2 id="what-heading" style={sectionTitle}>
          What is MasterSauce?
        </h2>
        <p style={proseCenterStyle}>
          MasterSauce is in-browser mastering tuned for loudness and clarity on Spotify, Apple Music, and similar platforms.
          You upload a mix, set genre and loudness, run a short analysis, then listen to a real A/B preview. When the tone
          feels right, you export the full-quality WAV — ideal for singles, demos, sync pitches, or late-night finish lines.
        </p>
        <p style={proseCenterStyle}>
          The workflow stays simple: no plugin rabbit holes, no guesswork about whether you are “done.” For more on
          streaming targets and release prep, see our{" "}
          <Link href="/learn" style={learnHintLinkStyle}>
            short guides
          </Link>
          .
        </p>
      </section>

      <section id="who-its-for" style={sectionStyle} aria-labelledby="who-heading">
        <h2 id="who-heading" style={sectionTitle}>
          Who it is for
        </h2>
        <p style={proseCenterStyle}>
          Bedroom producers finishing tracks at odd hours. Independent artists self-releasing without a big studio budget.
          AI music creators who want a consistent, release-ready level on their outputs. Anyone making music today who
          values speed, clarity, and a straightforward path from mix to master.
        </p>
      </section>

      <MobileMasterBanner />
      <UploadForm />

      <section id="how-it-works" style={sectionStyle}>
        <h2 style={sectionTitle}>How It Works</h2>
        <p style={sectionSubTitle}>Analyze once, preview freely, export when it locks in</p>
        <div style={stepsGridStyle}>
          <div style={stepCardStyle}>
            <div style={stepIconWrap}>⤴</div>
            <h3 style={stepTitleStyle}>Upload your mix</h3>
            <p style={stepTextStyle}>WAV or MP3, drag-and-drop or browse — processed securely, not shared as a library.</p>
          </div>
          <div style={stepCardStyle}>
            <div style={stepIconWrap}>⚙</div>
            <h3 style={stepTitleStyle}>Set genre & loudness</h3>
            <p style={stepTextStyle}>Choose the preset that matches the record — the engine adapts around your choices.</p>
          </div>
          <div style={stepCardStyle}>
            <div style={stepIconWrap}>🎧</div>
            <h3 style={stepTitleStyle}>Analyze, then A/B</h3>
            <p style={stepTextStyle}>A quick read of your file, then unlimited before/after playback while you decide.</p>
          </div>
          <div style={stepCardStyle}>
            <div style={stepIconWrap}>⬇</div>
            <h3 style={stepTitleStyle}>Export the final</h3>
            <p style={stepTextStyle}>Unlock the full-resolution master with email — only that export touches your quota.</p>
          </div>
        </div>
      </section>

      <TestimonialsSection />

      <section id="faq" style={sectionStyle} aria-labelledby="faq-heading">
        <h2 id="faq-heading" style={sectionTitle}>
          Common questions
        </h2>
        <p style={sectionSubTitle}>How uploads, previews, and billing work in practice.</p>
        <dl style={faqListStyle}>
          {HOME_FAQ_ITEMS.map((item) => (
            <div key={item.question} style={faqItemStyle}>
              <dt style={faqQStyle}>{item.question}</dt>
              <dd style={faqAStyle}>{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section style={dualCardSectionStyle}>
        <div style={infoCardStyle}>
          <h2 style={infoTitleStyle}>Your Rights, Always</h2>
          <ul style={trustListStyle}>
            <li style={trustListItemStyle}>✅ You keep 100% of your rights</li>
            <li style={trustListItemStyle}>✅ Unlimited previews — never counted toward your plan</li>
            <li style={trustListItemStyle}>✅ No watermark on finished masters</li>
            <li style={trustListItemStyle}>✅ Your files are never stored or distributed</li>
            <li style={trustListItemStyle}>✅ Pay only for final exports you choose to download</li>
          </ul>
        </div>
        <div style={infoCardStyle}>
          <h2 style={infoTitleStyle}>Fair by design</h2>
          <ul style={trustListStyle}>
            <li style={trustListItemStyle}>✅ You keep 100% of your rights</li>
            <li style={trustListItemStyle}>✅ Unlimited previews — never counted toward your plan</li>
            <li style={trustListItemStyle}>✅ No watermark on finished masters</li>
            <li style={trustListItemStyle}>✅ Your files are never stored or distributed</li>
            <li style={trustListItemStyle}>✅ Pay only for final exports you choose to download</li>
          </ul>
        </div>
      </section>

      <PricingSection />
      <p style={mutedSecondaryStyle}>
        🎵 Need help writing before you master? Try{" "}
        <Link href="/song-architect" style={linkStyle}>
          Song Architect
        </Link>{" "}
        — blueprint builder for Suno, Udio, and AI music creators.
      </p>

      <footer style={footerStyle}>
        <div style={footerBrandStyle}>
          <div style={footerLogoStyle}>♫</div>
          <div>
            <p style={footerNameStyle}>MasterSauce</p>
            <p style={footerTaglineStyle}>Release-ready mastering for creators</p>
          </div>
        </div>
        <div style={footerLinksStyle}>
          <Link href="/learn" style={linkStyle}>
            Learn
          </Link>
          <Link href="/about" style={linkStyle}>About</Link>
          <Link href="/terms" style={linkStyle}>Terms</Link>
          <Link href="/privacy" style={linkStyle}>Privacy</Link>
          <Link href="/pricing" style={linkStyle}>
            Manage subscription
          </Link>
          <Link href="/contact" style={linkStyle}>
            Contact
          </Link>
        </div>
      </footer>
      <p style={copyrightStyle}>© {new Date().getFullYear()} MasterSauce. Built for independent creators.</p>
    </main>
    </>
  );
}

const mainStyle: React.CSSProperties = {
  maxWidth: "1080px",
  margin: "0 auto",
  /* top, right, bottom, left — respect iOS safe areas so the column stays visually centered */
  padding: "18px max(20px, env(safe-area-inset-right, 0px)) 78px max(20px, env(safe-area-inset-left, 0px))",
  display: "grid",
  gap: "34px"
};

const topNavStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  border: "1px solid rgba(84, 100, 148, 0.32)",
  borderRadius: "16px",
  background: "linear-gradient(140deg, rgba(17, 24, 44, 0.78), rgba(10, 16, 31, 0.82))",
  boxShadow: "0 12px 24px rgba(2, 5, 14, 0.34)",
  padding: "10px 14px"
};

const topNavBrandWrap: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px"
};

const topNavBrandMark: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "8px",
  display: "grid",
  placeItems: "center",
  color: "#fff",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)"
};

const topNavBrandText: React.CSSProperties = {
  color: "#e7edff",
  fontWeight: 700,
  letterSpacing: "0.01em"
};

const topNavLinksWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap"
};

const topNavLinkStyle: React.CSSProperties = {
  color: "#b9c6ef",
  textDecoration: "none",
  fontSize: "0.92rem",
  fontWeight: 600,
  border: "1px solid rgba(86, 102, 156, 0.34)",
  borderRadius: "999px",
  padding: "8px 12px",
  background: "rgba(14, 22, 40, 0.68)"
};

const heroStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  textAlign: "center",
  padding: "54px clamp(20px, 5vw, 56px)",
  borderRadius: "34px",
  border: "1px solid rgba(74, 90, 150, 0.22)",
  boxShadow: "0 30px 72px rgba(4, 7, 16, 0.72), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
  background:
    "radial-gradient(1000px 380px at 50% -34%, rgba(155, 111, 255, 0.36), rgba(155, 111, 255, 0) 63%), radial-gradient(900px 520px at 0% 0%, rgba(46, 177, 255, 0.12), rgba(46, 177, 255, 0) 62%), linear-gradient(145deg, #121a32 0%, #0d1428 52%, #090f1f 100%)"
};

const heroLogoWrap: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  width: "100%",
  /* Tighter on small screens, ~24–40px breathing room on desktop */
  marginBottom: "clamp(12px, 2.5vw + 8px, 40px)"
};

const heroLogoImgStyle: React.CSSProperties = {
  /* ~180 mobile, ~260 tablet, ~320 desktop (artwork fills box after PNG trim) */
  width: "min(100%, clamp(180px, 30vw + 28px, 320px))",
  height: "auto",
  flexShrink: 0,
  objectFit: "contain",
  imageRendering: "auto"
};

const h1Style: React.CSSProperties = {
  margin: "0 auto clamp(16px, 2.2vw, 22px)",
  maxWidth: "760px",
  lineHeight: 1.08,
  fontSize: "clamp(2rem, 4.6vw, 3.9rem)",
  letterSpacing: "-0.018em",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif",
  color: "#f1f4ff"
};

const subStyle: React.CSSProperties = {
  margin: "0 auto",
  color: "#95a2c8",
  maxWidth: "680px",
  lineHeight: 1.75,
  fontSize: "1.2rem",
  textAlign: "center"
};

const platformRowStyle: React.CSSProperties = {
  marginTop: "14px",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
  justifyContent: "center"
};
const platformLabelStyle: React.CSSProperties = { color: "#a9b7dd", fontSize: "0.84rem", fontWeight: 600 };
const platformIconsWrapStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "8px" };

const heroCtaRow: React.CSSProperties = {
  marginTop: "28px",
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  justifyContent: "center"
};

const ctaPrimaryStyle: React.CSSProperties = {
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

const pillRowStyle: React.CSSProperties = {
  marginTop: "22px",
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  justifyContent: "center"
};

const pillStyle: React.CSSProperties = {
  borderRadius: "999px",
  border: "1px solid rgba(81, 97, 148, 0.42)",
  color: "#c8d1ef",
  background: "rgba(16, 24, 46, 0.72)",
  padding: "9px 14px",
  fontSize: "0.82rem"
};

const sectionStyle: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.94), rgba(12, 17, 30, 0.94))",
  border: "1px solid rgba(142, 155, 209, 0.2)",
  borderRadius: "24px",
  boxShadow: "0 18px 40px rgba(2, 4, 12, 0.45)",
  padding: "32px 24px"
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(1.9rem, 3.4vw, 2.9rem)",
  color: "#f1f4ff",
  textAlign: "center",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};
const sectionSubTitle: React.CSSProperties = {
  margin: "8px 0 0",
  textAlign: "center",
  color: "#90a0cb"
};

const proseCenterStyle: React.CSSProperties = {
  margin: "16px auto 0",
  maxWidth: "720px",
  color: "#9ca8cc",
  lineHeight: 1.65,
  fontSize: "1.02rem",
  textAlign: "center"
};

const faqListStyle: React.CSSProperties = {
  margin: "24px 0 0",
  display: "grid",
  gap: "22px"
};

const faqItemStyle: React.CSSProperties = { margin: 0 };

const faqQStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.05rem",
  fontWeight: 700,
  color: "#ebefff",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};

const faqAStyle: React.CSSProperties = {
  margin: "10px 0 0",
  padding: 0,
  color: "#9ca8cc",
  lineHeight: 1.65,
  fontSize: "0.98rem"
};
const stepsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "14px",
  marginTop: "26px"
};
const stepCardStyle: React.CSSProperties = {
  border: "1px solid rgba(74, 90, 150, 0.32)",
  borderRadius: "18px",
  background: "linear-gradient(155deg, rgba(19, 28, 52, 0.62), rgba(12, 19, 37, 0.62))",
  padding: "20px 14px",
  textAlign: "center"
};
const stepIconWrap: React.CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "14px",
  margin: "0 auto 12px",
  display: "grid",
  placeItems: "center",
  color: "#fff",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  boxShadow: "0 10px 30px rgba(121, 100, 255, 0.36)"
};
const stepTitleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  color: "#ebefff",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};
const stepTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#9ca8cc",
  lineHeight: 1.55,
  fontSize: "0.94rem"
};
const dualCardSectionStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "14px"
};
const infoCardStyle: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(22, 29, 48, 0.94), rgba(12, 17, 30, 0.94))",
  border: "1px solid rgba(142, 155, 209, 0.2)",
  borderRadius: "20px",
  boxShadow: "0 18px 40px rgba(2, 4, 12, 0.42)",
  padding: "22px"
};
const infoTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f1f4ff",
  fontSize: "2rem",
  textAlign: "left",
  fontFamily: "Outfit, Work Sans, system-ui, sans-serif"
};
const mutedStyle: React.CSSProperties = { color: "#b2bcdf", margin: "12px 0 0", lineHeight: 1.65 };
const mutedSecondaryStyle: React.CSSProperties = { color: "#9da8cb", margin: "10px 0 0", lineHeight: 1.65 };
const trustListStyle: React.CSSProperties = {
  margin: "12px 0 0",
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: "8px"
};
const trustListItemStyle: React.CSSProperties = {
  color: "#b2bcdf",
  lineHeight: 1.55
};

const footerStyle: React.CSSProperties = {
  marginTop: "8px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "14px",
  borderTop: "1px solid rgba(66, 78, 120, 0.46)",
  paddingTop: "18px"
};
const footerBrandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px"
};
const footerLogoStyle: React.CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "10px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(125deg, #8f62ff 0%, #6a7cff 100%)",
  color: "#fff"
};
const footerNameStyle: React.CSSProperties = { margin: 0, color: "#ebefff", fontWeight: 700 };
const footerTaglineStyle: React.CSSProperties = { margin: 0, color: "#8794bc", fontSize: "0.8rem" };
const footerLinksStyle: React.CSSProperties = {
  display: "flex",
  gap: "18px",
  color: "#929dc4",
  fontSize: "0.9rem"
};
const copyrightStyle: React.CSSProperties = {
  margin: "0",
  textAlign: "center",
  color: "#7f8aac",
  fontSize: "0.8rem"
};

const linkStyle: React.CSSProperties = {
  color: "#b2c0f0",
  textDecoration: "none"
};

const learnHintLinkStyle: React.CSSProperties = {
  color: "#a8b8f0",
  textDecoration: "underline",
  textDecorationColor: "rgba(143, 160, 230, 0.4)",
  textUnderlineOffset: "3px"
};

const successBannerStyle: React.CSSProperties = {
  border: "1px solid rgba(93, 221, 175, 0.45)",
  borderRadius: "16px",
  background: "linear-gradient(150deg, rgba(13, 41, 41, 0.86), rgba(12, 26, 36, 0.86))",
  boxShadow: "0 14px 30px rgba(2, 9, 14, 0.35)",
  padding: "14px 16px"
};

const successEyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.76rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "#9ff3d2"
};

const successBodyStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontWeight: 600,
  color: "#e2fff5"
};
