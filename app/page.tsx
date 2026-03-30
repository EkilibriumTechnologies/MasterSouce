import Image from "next/image";
import Link from "next/link";
import { PricingSection } from "@/components/pricing-section";
import { UploadForm } from "@/components/upload-form";

type HomePageProps = {
  searchParams?: {
    checkout?: string | string[];
    kind?: string | string[];
  };
};

function getFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function HomePage({ searchParams }: HomePageProps) {
  const checkout = getFirst(searchParams?.checkout);
  const kind = getFirst(searchParams?.kind);
  const showCheckoutSuccess = checkout === "success";
  const checkoutSuccessMessage =
    kind === "credit_pack" ? "Your credit pack was added successfully." : "Your plan is now active.";

  return (
    <main style={mainStyle}>
      {showCheckoutSuccess ? (
        <section style={successBannerStyle} aria-live="polite">
          <p style={successEyebrowStyle}>Purchase complete</p>
          <p style={successBodyStyle}>{checkoutSuccessMessage}</p>
        </section>
      ) : null}
      <section style={heroStyle}>
        <div style={heroLogoWrap}>
          <Image
            src="/mastersauce-logo.png"
            alt="MasterSauce logo"
            width={466}
            height={381}
            priority
            sizes="(max-width: 640px) min(180px, 90vw), (max-width: 1024px) 260px, 320px"
            style={heroLogoImgStyle}
          />
        </div>
        <h1 style={h1Style}>Professional Mastering in Minutes, Not Hours</h1>
        <p style={subStyle}>
          Smart automatic mastering built for independent musicians, bedroom producers, and AI music creators. Upload your
          track, preview instantly, export the final master.
        </p>
        <div style={heroCtaRow}>
          <a href="#master" style={ctaPrimaryStyle}>
            Start Mastering
          </a>
        </div>
        <div style={pillRowStyle}>
          <span style={pillStyle}>⚡ Fast Turnaround</span>
          <span style={pillStyle}>🎧 Before/After Preview</span>
          <span style={pillStyle}>✉️ Email Only for Final Master</span>
        </div>
      </section>

      <UploadForm />

      <section id="how-it-works" style={sectionStyle}>
        <h2 style={sectionTitle}>How It Works</h2>
        <p style={sectionSubTitle}>Professional mastering in four simple steps</p>
        <div style={stepsGridStyle}>
          <div style={stepCardStyle}>
            <div style={stepIconWrap}>⤴</div>
            <h3 style={stepTitleStyle}>Upload Your Track</h3>
            <p style={stepTextStyle}>Drag and drop your WAV or MP3 file. Simple and fast.</p>
          </div>
          <div style={stepCardStyle}>
            <div style={stepIconWrap}>⚙</div>
            <h3 style={stepTitleStyle}>Choose Settings</h3>
            <p style={stepTextStyle}>Pick your genre and loudness. Our AI handles the rest.</p>
          </div>
          <div style={stepCardStyle}>
            <div style={stepIconWrap}>🎧</div>
            <h3 style={stepTitleStyle}>Preview Instantly</h3>
            <p style={stepTextStyle}>Compare before exporting. No surprises.</p>
          </div>
          <div style={stepCardStyle}>
            <div style={stepIconWrap}>⬇</div>
            <h3 style={stepTitleStyle}>Export & Go</h3>
            <p style={stepTextStyle}>Enter your email and get your mastered track immediately.</p>
          </div>
        </div>
      </section>

      <section style={dualCardSectionStyle}>
        <div style={infoCardStyle}>
          <h2 style={infoTitleStyle}>Your Rights, Always</h2>
          <p style={mutedStyle}>
            You retain 100% ownership of your music. We process your tracks securely and never store or distribute your
            files without permission.
          </p>
          <p style={mutedSecondaryStyle}>MasterSauce is a tool, not a rights holder. Your creative work stays yours.</p>
        </div>
        <div style={infoCardStyle}>
          <h2 style={infoTitleStyle}>Fair by design</h2>
          <p style={mutedStyle}>Master and preview as much as you want.</p>
          <p style={mutedSecondaryStyle}>Only final mastered exports count toward your monthly masters.</p>
        </div>
      </section>

      <PricingSection />

      <footer style={footerStyle}>
        <div style={footerBrandStyle}>
          <div style={footerLogoStyle}>♫</div>
          <div>
            <p style={footerNameStyle}>MasterSauce</p>
            <p style={footerTaglineStyle}>Smart mastering for creators</p>
          </div>
        </div>
        <div style={footerLinksStyle}>
          <a href="#" style={linkStyle}>About</a>
          <Link href="/terms" style={linkStyle}>Terms</Link>
          <Link href="/privacy" style={linkStyle}>Privacy</Link>
          <Link href="/pricing" style={linkStyle}>Manage subscription</Link>
          <span style={linkStyle}>Contact</span>
        </div>
      </footer>
      <p style={copyrightStyle}>© {new Date().getFullYear()} MasterSauce. Built for independent creators.</p>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  maxWidth: "1080px",
  margin: "0 auto",
  padding: "18px 20px 78px",
  display: "grid",
  gap: "34px"
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
  maxWidth: "640px",
  lineHeight: 1.58,
  fontSize: "1.05rem"
};

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
