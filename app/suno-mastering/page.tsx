import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";

import { MasterSauceBrandHeroLogo, MasterSauceBrandNav } from "@/components/brand/mastersauce-brand-header";
import { FaqSection } from "@/components/learn/faq-section";
import { FAQSchema, type FaqItem } from "@/components/seo/faq-schema";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { absoluteUrl } from "@/lib/site";

import {
  articleStyle,
  ctaBodyStyle,
  ctaHeadingStyle,
  ctaPrimaryStyle,
  ctaRowStyle,
  ctaSecondaryStyle,
  ctaSectionStyle,
  ctaTertiaryStyle,
  eyebrowStyle,
  h1Style,
  h2Style,
  h3Style,
  heroStyle,
  inlineLinkStyle,
  listItemStyle,
  listStyle,
  mainStyle,
  pStyle
} from "../learn/learn-styles";

const path = "/suno-mastering";
const title = "AI Mastering for Suno Songs | MasterSauce";
const description =
  "Analyze and master music created with Suno. Check tonal balance, dynamics, loudness, and Master Readiness before preparing your AI-generated song for release.";

const faqItems: FaqItem[] = [
  {
    question: "Do Suno songs need mastering?",
    answer:
      "Not every song needs the same amount of processing, but a track created with Suno can still benefit from mastering. A mastering pass can improve tonal balance, control dynamics and loudness, and help the track translate more consistently across playback systems. Compare the original and mastered versions before deciding."
  },
  {
    question: "Can I master a Suno song before Spotify distribution?",
    answer:
      "Yes. Export the finished song from Suno, upload it to MasterSauce, review the analysis and Master Readiness notes, then A/B the master before downloading the file you plan to send to your distributor. Mastering can prepare a track for streaming, but it does not guarantee acceptance, playback level, or performance on Spotify."
  },
  {
    question: "Should I use WAV when mastering an AI-generated song?",
    answer:
      "Use a WAV export when one is available because it preserves more source quality than a compressed MP3. MasterSauce accepts both WAV and MP3, so you can still master an MP3 when that is the source you have."
  },
  {
    question: "What does MasterSauce analyze before mastering?",
    answer:
      "MasterSauce analyzes the uploaded audio and shows a Master Readiness assessment for mix conditions such as low-end balance, harshness, dynamics, and headroom. The workflow also uses the track analysis to recommend a mastering profile. These are practical signals to review, not an absolute score of musical quality."
  },
  {
    question: "Is MasterSauce part of Suno?",
    answer:
      "No. Suno is a third-party AI music creation platform. MasterSauce is an independent product and is not affiliated with or endorsed by Suno. There is no sponsorship, partnership, or official integration."
  }
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path,
  absoluteTitle: true
});

const WORKFLOW_STEPS = [
  { label: "Song Architect", href: "/song-architect" },
  { label: "Suno", href: null },
  { label: "Analyze", href: "/ar-ai" },
  { label: "Master Readiness", href: "/#master" },
  { label: "Master", href: "/#master" },
  { label: "Release", href: null }
] as const;

export default function SunoMasteringPage() {
  return (
    <>
      <FAQSchema title={title} description={description} date="2026-08-26" url={absoluteUrl(path)} faq={faqItems} />
      <main style={mainStyle}>
        <MasterSauceBrandNav backHref="/" backLabel="← Back to MasterSauce" />

        <header style={heroStyle}>
          <MasterSauceBrandHeroLogo priority />
          <p style={eyebrowStyle}>For Suno creators</p>
          <h1 style={{ ...h1Style, maxWidth: "28ch" }}>AI Mastering for Suno Songs</h1>
          <p style={heroIntroStyle}>
            AI-generated music can still need a finishing pass after generation. Tonal balance, dynamics, loudness,
            headroom, and translation across playback systems all affect whether a track feels ready to release.
          </p>
          <p style={heroTaglineStyle}>
            MasterSauce analyzes your Suno export, checks Master Readiness, and lets you compare the original with a
            mastered version before you choose what to release.
          </p>
          <div style={{ ...ctaRowStyle, marginTop: "24px" }}>
            <Link href="/#master" style={ctaPrimaryStyle}>
              Master a Suno song
            </Link>
            <Link href="/ar-ai" style={ctaSecondaryStyle}>
              Analyze Your Song
            </Link>
          </div>
        </header>

        <section style={articleStyle} aria-labelledby="why-master-suno-heading">
          <h2 id="why-master-suno-heading" style={h2Style}>
            Why a generated Suno track may still need mastering
          </h2>
          <p style={pStyle}>
            Suno is a third-party platform for creating music with AI. Generation can produce a complete song, but the
            exported audio may still sound too bright, muddy, compressed, quiet, or inconsistent next to finished releases.
            Those are source-dependent issues, so the right amount of mastering differs from track to track.
          </p>
          <p style={pStyle}>
            Mastering is the final quality-control and polish stage. It can refine tonal balance, manage peaks and
            dynamics, set a suitable loudness direction, and help the song translate across earbuds, speakers, cars, and
            streaming playback. It cannot rewrite the arrangement or repair every problem in the generated source.
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="suno-analysis-heading">
          <h2 id="suno-analysis-heading" style={h2Style}>
            Analyze the track before mastering
          </h2>
          <p style={pStyle}>
            Upload the finished Suno export to the real{" "}
            <Link href="/#master" style={inlineLinkStyle}>
              MasterSauce mastering workflow
            </Link>
            . Track analysis provides measurements used by the mastering workflow and recommends a mastering profile.
            Master Readiness then surfaces practical mix conditions such as low-end balance, harshness, dynamics, and
            headroom.
          </p>
          <p style={pStyle}>
            Treat those notes as decision support, not a verdict. If the analysis finds a source issue, you can improve
            the export first or continue and judge the result with your own ears. Incomplete analysis does not block the
            mastering workflow.
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="suno-mastering-workflow-heading">
          <h2 id="suno-mastering-workflow-heading" style={h2Style}>
            An adaptive mastering workflow for AI-generated music
          </h2>
          <p style={pStyle}>
            Choose a genre preset and loudness direction for a fast recommended master, or describe the result you want
            with prompt-guided mastering. You can also add an optional reference track or artist to guide tone, loudness,
            and balance. When analysis suggests it may help, optional AI Audio Restoration can run before mastering.
          </p>
          <p style={pStyle}>Listen for more than volume when you compare the original and master:</p>
          <ul style={listStyle}>
            <li style={listItemStyle}>tonal balance: controlled low end, clear mids, and smoother highs</li>
            <li style={listItemStyle}>dynamics: stable energy without flattening the song&apos;s impact</li>
            <li style={listItemStyle}>loudness: a confident level without unnecessary clipping or harshness</li>
            <li style={listItemStyle}>translation: a consistent result across different playback systems</li>
          </ul>
          <p style={pStyle}>
            A/B the original and mastered previews before you commit. Free MP3 masters are available, while premium plans
            unlock HD WAV exports. Mastering should improve the track; if it does not, keep the original or revise the
            source.
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="suno-release-heading">
          <h2 id="suno-release-heading" style={h2Style}>
            Prepare a Suno song for streaming release
          </h2>
          <p style={pStyle}>
            Use the highest-quality source Suno makes available to you. WAV is recommended when possible because it avoids
            adding another layer of lossy compression before mastering, but MasterSauce also accepts MP3 files.
          </p>
          <p style={pStyle}>
            A balanced master can help a track hold up on Spotify and other streaming services, but no mastering tool can
            guarantee a platform&apos;s acceptance, normalization behavior, playlist placement, or commercial result. Your
            distributor&apos;s current delivery requirements still apply. For more context, read{" "}
            <Link href="/learn/spotify-ready-mastering" style={inlineLinkStyle}>
              how to prepare a track for Spotify
            </Link>
            .
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="suno-workflow-heading">
          <h2 id="suno-workflow-heading" style={h2Style}>
            How MasterSauce fits the Suno creation workflow
          </h2>
          <p style={pStyle}>
            Use only the parts you need. Song Architect can help shape the song before generation, Analyze Your Song can
            provide an A&amp;R-style release-readiness report after generation, and the mastering workflow handles the final
            analysis, comparison, and export.
          </p>
          <ol style={workflowListStyle} aria-label="Song Architect to release workflow">
            {WORKFLOW_STEPS.map((step, index) => (
              <li key={step.label} style={workflowStepStyle}>
                <span style={workflowIndexStyle}>{index + 1}</span>
                {step.href ? (
                  <Link href={step.href} style={workflowLinkStyle}>
                    {step.label}
                  </Link>
                ) : (
                  <span style={workflowLabelStyle}>{step.label}</span>
                )}
                {index < WORKFLOW_STEPS.length - 1 ? (
                  <span style={workflowArrowStyle} aria-hidden>
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <p style={workflowCaptionStyle}>
            Song Architect → Suno → Analyze → Master Readiness → Master → Release
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="suno-before-heading">
          <h2 id="suno-before-heading" style={h2Style}>
            Before generation
          </h2>
          <h3 style={h3Style}>Shape the song in Song Architect</h3>
          <p style={pStyle}>
            When the idea is still in your head,{" "}
            <Link href="/song-architect" style={inlineLinkStyle}>
              Song Architect
            </Link>{" "}
            helps you build a stronger blueprint before you paste anything into Suno. It is a creative decision tool, not
            a hit guarantee — and the same outputs also work with Udio and other AI music generators.
          </p>
          <p style={pStyle}>Use it to shape:</p>
          <ul style={listStyle}>
            <li style={listItemStyle}>lyrics</li>
            <li style={listItemStyle}>hooks</li>
            <li style={listItemStyle}>song structure</li>
            <li style={listItemStyle}>vocal direction</li>
            <li style={listItemStyle}>energy progression</li>
            <li style={listItemStyle}>genre and style guidance</li>
            <li style={listItemStyle}>ready-to-use generation prompts</li>
          </ul>
          <p style={pStyle}>
            Copy the prompt into Suno, generate, then bring the export back here to finish.
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="suno-after-heading">
          <h2 id="suno-after-heading" style={h2Style}>
            After generation
          </h2>
          <h3 style={h3Style}>Analyze Your Song</h3>
          <p style={pStyle}>
            Once you have a Suno export,{" "}
            <Link href="/ar-ai" style={inlineLinkStyle}>
              Analyze Your Song
            </Link>{" "}
            (Hit Analyzer) gives an A&amp;R-style release-readiness report. It does not predict whether the song will
            become a hit, and it is not a scientific score of musical quality.
          </p>
          <p style={pStyle}>The report looks at signals such as:</p>
          <ul style={listStyle}>
            <li style={listItemStyle}>hook strength</li>
            <li style={listItemStyle}>production quality</li>
            <li style={listItemStyle}>replay value</li>
            <li style={listItemStyle}>arrangement</li>
            <li style={listItemStyle}>playlist fit</li>
            <li style={listItemStyle}>commercial readiness</li>
          </ul>
          <p style={pStyle}>
            Use it to decide what feels strong, what may be holding the song back, and what to improve before you master
            or release. For a focused overview of that report, see the{" "}
            <Link href="/suno-song-analyzer" style={inlineLinkStyle}>
              Suno Song Analyzer
            </Link>
            .
          </p>
        </section>

        <section style={ctaSectionStyle} aria-labelledby="suno-landing-cta-heading">
          <h2 id="suno-landing-cta-heading" style={ctaHeadingStyle}>
            Master your Suno song before release
          </h2>
          <p style={ctaBodyStyle}>
            Upload the export, review Master Readiness, and compare the original with the master before downloading.
          </p>
          <div style={ctaRowStyle}>
            <Link href="/#master" style={ctaPrimaryStyle}>
              Master a Suno song
            </Link>
            <Link href="/ar-ai" style={ctaSecondaryStyle}>
              Analyze Your Song
            </Link>
            <Link href="/song-architect" style={ctaTertiaryStyle}>
              Open Song Architect
            </Link>
          </div>
          <p style={{ ...ctaBodyStyle, marginTop: "18px", marginBottom: 0, fontSize: "0.92rem" }}>
            Compare plans on the{" "}
            <Link href="/pricing" style={inlineLinkStyle}>
              pricing page
            </Link>
            .
          </p>
        </section>

        <FaqSection items={faqItems} />

        <p style={trademarkStyle}>
          Suno is a trademark of its respective owner. MasterSauce is an independent product and is not affiliated with or
          endorsed by Suno. There is no sponsorship, partnership, or official integration.
        </p>
      </main>
    </>
  );
}

const contentSectionStyle: CSSProperties = {
  ...articleStyle,
  marginTop: "clamp(28px, 5vw, 44px)"
};

const heroIntroStyle: CSSProperties = {
  margin: "0 auto",
  maxWidth: "54ch",
  fontSize: "1.0625rem",
  lineHeight: 1.68,
  color: "#9ca8cc",
  textAlign: "center"
};

const heroTaglineStyle: CSSProperties = {
  margin: "16px auto 0",
  maxWidth: "40ch",
  fontSize: "1.05rem",
  fontWeight: 600,
  lineHeight: 1.45,
  color: "#d6defa"
};

const workflowListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px 4px",
  listStyle: "none",
  margin: "8px 0 0",
  padding: 0
};

const workflowStepStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px"
};

const workflowIndexStyle: CSSProperties = {
  width: "22px",
  height: "22px",
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "#e8ecff",
  background: "rgba(143, 98, 255, 0.35)",
  border: "1px solid rgba(143, 98, 255, 0.5)"
};

const workflowLinkStyle: CSSProperties = {
  color: "#d6defa",
  fontWeight: 600,
  textDecoration: "underline",
  textDecorationColor: "rgba(143, 160, 230, 0.45)",
  textUnderlineOffset: "3px"
};

const workflowLabelStyle: CSSProperties = {
  color: "#e8ecff",
  fontWeight: 600
};

const workflowArrowStyle: CSSProperties = {
  color: "rgba(156, 168, 204, 0.7)",
  padding: "0 4px 0 2px"
};

const workflowCaptionStyle: CSSProperties = {
  ...pStyle,
  marginTop: "12px",
  textAlign: "center",
  fontWeight: 600,
  color: "#d6defa"
};

const trademarkStyle: CSSProperties = {
  margin: "40px auto 0",
  maxWidth: "52ch",
  fontSize: "0.82rem",
  lineHeight: 1.6,
  color: "rgba(156, 168, 204, 0.78)",
  textAlign: "center"
};
