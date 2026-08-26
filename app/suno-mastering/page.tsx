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
const title = "Suno Mastering & Song Tools | Master Your Suno Songs | MasterSauce";
const description =
  "If you created your track in Suno, MasterSauce gives you a workflow for shaping the idea, analyzing the export, checking Master Readiness, and preparing the final track for release.";

const faqItems: FaqItem[] = [
  {
    question: "How do I master a song created with Suno?",
    answer:
      "Export the track from Suno, upload it to MasterSauce, review analysis and Master Readiness, A/B the master, then download the version you want to release. Free MP3 previews are available before you export; premium plans unlock HD WAV."
  },
  {
    question: "Can I improve a Suno song before I generate it?",
    answer:
      "Yes. Song Architect helps you shape lyrics, hooks, structure, vocal direction, energy, genre guidance, and generation prompts before you paste them into Suno. The same blueprints also work with Udio and other AI music generators."
  },
  {
    question: "Does Analyze Your Song tell me if a Suno track will be a hit?",
    answer:
      "No. Hit Analyzer is an A&R-style release-readiness report, not a hit prediction. It looks at signals such as hook strength, production quality, replay value, arrangement, playlist fit, and commercial readiness so you can decide what to improve."
  },
  {
    question: "Is MasterSauce only for Suno?",
    answer:
      "No. MasterSauce is built for independent and AI music creators more broadly. Songs created with Suno are a natural fit, but the same tools work for Udio, DAW mixes, and other recordings."
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
          <h1 style={{ ...h1Style, maxWidth: "28ch" }}>Master, Analyze, and Improve Your Suno Songs</h1>
          <p style={heroIntroStyle}>
            MasterSauce is the production layer around AI-generated music. If you created your track in Suno, you get a
            workflow for shaping the idea first, judging the export honestly, and preparing the final file for release.
          </p>
          <p style={heroTaglineStyle}>Create with Suno. Finish with MasterSauce.</p>
        </header>

        <section style={articleStyle} aria-labelledby="suno-workflow-heading">
          <h2 id="suno-workflow-heading" style={h2Style}>
            The workflow for Suno creators
          </h2>
          <p style={pStyle}>
            Generation gets you a song. Finishing is a different job. MasterSauce sits around that Suno export so you can
            improve the idea, check the result, and master with your own ears in the loop.
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
            or release.
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="suno-readiness-heading">
          <h2 id="suno-readiness-heading" style={h2Style}>
            Master Readiness
          </h2>
          <p style={pStyle}>
            When you{" "}
            <Link href="/#master" style={inlineLinkStyle}>
              upload for mastering
            </Link>
            , Master Readiness is a heuristic check of mix issues — things like low-end, harshness, dynamics, and
            headroom. It is a readiness assessment, not an absolute music-quality score.
          </p>
          <p style={pStyle}>
            You may see notes suggesting the mix is ready, that minor issues showed up, or that it is worth improving
            the mix first. Incomplete analysis never blocks you. Review the notes, then master anyway or go back and
            fix the source.
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="suno-mastering-heading">
          <h2 id="suno-mastering-heading" style={h2Style}>
            Mastering
          </h2>
          <p style={pStyle}>
            MasterSauce helps prepare AI-generated tracks — including music created with Suno — for release. Choose a
            genre preset, describe the sound you want, or add an optional reference track or artist. Optional AI Audio
            Restoration can run first when the analysis suggests it may help.
          </p>
          <p style={pStyle}>What you can actually do here:</p>
          <ul style={listStyle}>
            <li style={listItemStyle}>A/B the original and mastered versions before you commit</li>
            <li style={listItemStyle}>download free MP3 masters</li>
            <li style={listItemStyle}>export HD WAV on premium plans</li>
            <li style={listItemStyle}>aim for playback on Spotify, Apple Music, and YouTube</li>
          </ul>
          <p style={pStyle}>
            Mastering does not rewrite the song. It is the last polish pass so the export feels clearer, more balanced,
            and closer to release. Compare with your own ears — if it does not lift the track, do not export.
          </p>
          <p style={pStyle}>
            For a deeper walkthrough of common export issues, read{" "}
            <Link href="/learn/best-mastering-for-suno-ai-songs" style={inlineLinkStyle}>
              Best Mastering for Suno AI Songs
            </Link>{" "}
            and{" "}
            <Link href="/learn/spotify-ready-mastering" style={inlineLinkStyle}>
              how to prepare a track for Spotify
            </Link>
            .
          </p>
        </section>

        <section style={ctaSectionStyle} aria-labelledby="suno-landing-cta-heading">
          <h2 id="suno-landing-cta-heading" style={ctaHeadingStyle}>
            Finish the next Suno song in MasterSauce
          </h2>
          <p style={ctaBodyStyle}>
            Start with a stronger blueprint, analyze the export, then master the version you actually want to release.
          </p>
          <div style={ctaRowStyle}>
            <Link href="/song-architect" style={ctaPrimaryStyle}>
              Open Song Architect
            </Link>
            <Link href="/#master" style={ctaSecondaryStyle}>
              Master a Suno song
            </Link>
            <Link href="/ar-ai" style={ctaTertiaryStyle}>
              Analyze Your Song
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
          Suno is a trademark of its respective owner. MasterSauce is an independent product and is not affiliated with,
          endorsed by, or partnered with Suno.
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
