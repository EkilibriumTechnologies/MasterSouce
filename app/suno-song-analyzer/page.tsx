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

const path = "/suno-song-analyzer";
const title = "Suno Song Analyzer | Analyze AI-Generated Music | MasterSauce";
const description =
  "Upload a Suno-generated track for an A&R-style report on production quality, hooks, replay value, playlist fit, and release readiness before mastering or release.";

const faqItems: FaqItem[] = [
  {
    question: "Can I analyze a song created with Suno?",
    answer:
      "Yes. Export the finished track from Suno, then upload the WAV or MP3 to MasterSauce Hit Analyzer. The report evaluates the uploaded audio and the creative context you provide; MasterSauce does not access Suno accounts or internal data."
  },
  {
    question: "What does the Suno Song Analyzer check?",
    answer:
      "The Hit Analyzer reviews signals including production quality, hook strength, replay value, emotional impact, arrangement, playlist fit, and commercial readiness within the intended genre. When available, it also reports technical audio measurements such as loudness, peak level, dynamics, and frequency-band energy."
  },
  {
    question: "Should I analyze my Suno song before mastering?",
    answer:
      "Analysis can help you spot production, songwriting, or release-readiness concerns before the final mastering pass. Use the report to decide whether to revise the source or continue to mastering, then compare the original and mastered versions with your own ears."
  },
  {
    question: "Does MasterSauce change my audio during analysis?",
    answer:
      "No. Hit Analyzer evaluates the uploaded track and returns a report; it does not master or rewrite the audio. Mastering is a separate workflow you can choose after reviewing the analysis."
  },
  {
    question: "Can I use the analyzer before releasing to Spotify or another streaming service?",
    answer:
      "Yes. The report can support release decisions by highlighting production quality, playlist fit, commercial readiness, and improvement opportunities. It cannot guarantee distributor acceptance, playlist placement, streams, or commercial success."
  }
];

const analyzerSignals = [
  "Production quality",
  "Hook strength",
  "Replay value",
  "Emotional impact",
  "Arrangement",
  "Playlist fit",
  "Commercial readiness",
  "Highest-impact improvements"
] as const;

const reportSections = [
  {
    title: "Overall A&R rating and summary",
    body: "A contextual rating, explanation, and executive summary help frame the report without presenting the result as a prediction."
  },
  {
    title: "Production, songwriting, and commercial analysis",
    body: "Separate report sections explain how the track reads technically, creatively, and within the genre and release context you provide."
  },
  {
    title: "Strengths, weaknesses, and improvements",
    body: "Ranked findings identify what already works, what may hold the track back, and practical changes with the greatest potential impact."
  },
  {
    title: "Technical audio measurements",
    body: "When available, the report includes duration, integrated LUFS, peak level, crest factor, and energy across low, low-mid, presence, and air bands."
  }
] as const;

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path,
  absoluteTitle: true
});

export default function SunoSongAnalyzerPage() {
  return (
    <>
      <FAQSchema title={title} description={description} date="2026-08-28" url={absoluteUrl(path)} faq={faqItems} />
      <main style={mainStyle}>
        <MasterSauceBrandNav backHref="/" backLabel="← Back to MasterSauce" />

        <header style={heroStyle}>
          <MasterSauceBrandHeroLogo priority />
          <p style={eyebrowStyle}>Analysis for AI-generated music</p>
          <h1 style={{ ...h1Style, maxWidth: "22ch" }}>Suno Song Analyzer</h1>
          <p style={heroIntroStyle}>
            Upload a finished Suno export to MasterSauce Hit Analyzer for an A&amp;R-style release-readiness report. See
            what feels strong, what may be holding the track back, and what to improve before mastering or release.
          </p>
          <p style={heroNoteStyle}>
            The report supports creative decisions. It does not predict hits, guarantee playlist placement, or replace
            your own listening judgment.
          </p>
          <div style={{ ...ctaRowStyle, marginTop: "24px" }}>
            <Link href="/ar-ai" style={ctaPrimaryStyle}>
              Analyze Your Suno Song
            </Link>
            <Link href="/suno-mastering" style={ctaSecondaryStyle}>
              Explore Suno Mastering
            </Link>
          </div>
        </header>

        <section style={articleStyle} aria-labelledby="analyzer-checks-heading">
          <h2 id="analyzer-checks-heading" style={h2Style}>
            What the analyzer checks
          </h2>
          <p style={pStyle}>
            Hit Analyzer combines audio-feature analysis with the intended genre, audience, release goal, references,
            and optional lyrics you provide. The report evaluates real product categories already used by the interactive
            tool:
          </p>
          <ul style={signalGridStyle}>
            {analyzerSignals.map((signal) => (
              <li key={signal} style={signalCardStyle}>
                {signal}
              </li>
            ))}
          </ul>
          <p style={pStyle}>
            Open the actual{" "}
            <Link href="/ar-ai" style={inlineLinkStyle}>
              MasterSauce Hit Analyzer
            </Link>{" "}
            to upload a WAV or MP3 and generate the report. This landing page explains the workflow; it does not
            duplicate the analyzer.
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="before-mastering-heading">
          <h2 id="before-mastering-heading" style={h2Style}>
            Why analyze a Suno track before mastering
          </h2>
          <p style={pStyle}>
            A generated track can be creatively complete while still carrying issues that affect how it translates:
            uneven tonal balance, limited dynamics, harsh presence, heavy low end, or a loudness profile that does not
            sit comfortably beside finished releases. Analysis helps you decide what belongs in the source and what can
            reasonably be handled during mastering.
          </p>
          <p style={pStyle}>
            Hit Analyzer can surface technical measurements alongside feedback on production, arrangement, hooks, and
            release context. It does not change the file. After reviewing the report, you can revise the source or move
            into the separate{" "}
            <Link href="/#master" style={inlineLinkStyle}>
              MasterSauce mastering workflow
            </Link>
            .
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="report-heading">
          <h2 id="report-heading" style={h2Style}>
            What you get from the report
          </h2>
          <div style={reportGridStyle}>
            {reportSections.map((section) => (
              <article key={section.title} style={reportCardStyle}>
                <h3 style={h3Style}>{section.title}</h3>
                <p style={{ ...pStyle, marginBottom: 0 }}>{section.body}</p>
              </article>
            ))}
          </div>
          <p style={pStyle}>
            Findings are decision support, not scientific certainty. The scorecard and improvement list are most useful
            when you compare them with the song&apos;s purpose, your own ears, and the audience you want to reach.
          </p>
        </section>

        <section style={contentSectionStyle} aria-labelledby="workflow-heading">
          <h2 id="workflow-heading" style={h2Style}>
            Analyze first, master second
          </h2>
          <ol style={listStyle}>
            <li style={listItemStyle}>
              Shape the concept, structure, lyrics, and generation direction in{" "}
              <Link href="/song-architect" style={inlineLinkStyle}>
                Song Architect
              </Link>{" "}
              if you are still developing the song.
            </li>
            <li style={listItemStyle}>Export the finished track from Suno as WAV when available, or use MP3.</li>
            <li style={listItemStyle}>
              Upload it to{" "}
              <Link href="/ar-ai" style={inlineLinkStyle}>
                Hit Analyzer
              </Link>{" "}
              and review the report.
            </li>
            <li style={listItemStyle}>Revise the source if the findings point to creative or production issues.</li>
            <li style={listItemStyle}>
              Master the chosen version, A/B the result, and review{" "}
              <Link href="/pricing" style={inlineLinkStyle}>
                export options
              </Link>{" "}
              only when you are ready.
            </li>
          </ol>
        </section>

        <section style={contentSectionStyle} aria-labelledby="ai-workflow-heading">
          <h2 id="ai-workflow-heading" style={h2Style}>
            Built for AI-generated music workflows
          </h2>
          <p style={pStyle}>
            MasterSauce analyzes the audio file you upload, not private generator data. That makes the same workflow
            useful for songs created with Suno, Udio, another music generator, or a traditional DAW. Suno-specific
            searches lead here because the questions are familiar: does the export translate, is the hook clear, and
            what should you address before the final master?
          </p>
          <p style={pStyle}>
            For the separate finishing process, read the{" "}
            <Link href="/suno-mastering" style={inlineLinkStyle}>
              AI mastering guide for Suno songs
            </Link>
            .
          </p>
        </section>

        <section style={ctaSectionStyle} aria-labelledby="analyzer-cta-heading">
          <h2 id="analyzer-cta-heading" style={ctaHeadingStyle}>
            Check your Suno song before release
          </h2>
          <p style={ctaBodyStyle}>
            Upload the finished export to the real Hit Analyzer and turn the report into your next production decision.
          </p>
          <div style={ctaRowStyle}>
            <Link href="/ar-ai" style={ctaPrimaryStyle}>
              Open Hit Analyzer
            </Link>
            <Link href="/#master" style={ctaSecondaryStyle}>
              Start Mastering
            </Link>
            <Link href="/pricing" style={ctaTertiaryStyle}>
              Compare Plans
            </Link>
          </div>
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
  maxWidth: "57ch",
  fontSize: "1.0625rem",
  lineHeight: 1.68,
  color: "#9ca8cc",
  textAlign: "center"
};

const heroNoteStyle: CSSProperties = {
  margin: "16px auto 0",
  maxWidth: "52ch",
  color: "#c8d1ef",
  fontSize: "0.94rem",
  lineHeight: 1.6,
  textAlign: "center"
};

const signalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "10px",
  listStyle: "none",
  margin: "20px 0",
  padding: 0
};

const signalCardStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid rgba(118, 136, 210, 0.34)",
  background: "rgba(12, 19, 38, 0.72)",
  color: "#dce4ff",
  fontWeight: 600
};

const reportGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "14px",
  margin: "20px 0"
};

const reportCardStyle: CSSProperties = {
  padding: "18px",
  borderRadius: "14px",
  border: "1px solid rgba(118, 136, 210, 0.34)",
  background: "linear-gradient(150deg, rgba(18, 26, 48, 0.9), rgba(10, 16, 32, 0.8))"
};

const trademarkStyle: CSSProperties = {
  margin: "40px auto 0",
  maxWidth: "52ch",
  fontSize: "0.82rem",
  lineHeight: 1.6,
  color: "rgba(156, 168, 204, 0.78)",
  textAlign: "center"
};
