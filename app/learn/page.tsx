import type { Metadata } from "next";
import Link from "next/link";

import { MasterSauceBrandHeroLogo, MasterSauceBrandNav } from "@/components/brand/mastersauce-brand-header";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

import {
  articleCardDescStyle,
  articleCardListStyle,
  articleCardMetaDotStyle,
  articleCardMetaRowStyle,
  articleCardReadStyle,
  articleCardStyle,
  articleCardTitleLinkStyle,
  articleCardTitleStyle,
  ctaBodyStyle,
  ctaHeadingStyle,
  ctaPrimaryStyle,
  ctaRowStyle,
  ctaSecondaryStyle,
  ctaSectionStyle,
  ctaTertiaryStyle,
  disclaimerBoxStyle,
  disclaimerTextStyle,
  eyebrowStyle,
  featuredPillStyle,
  h1Style,
  h2Style,
  heroStyle,
  inlineLinkStyle,
  mainStyle,
  topicCardBodyStyle,
  topicCardStyle,
  topicCardTitleStyle,
  topicGridStyle,
  topicSectionStyle
} from "./learn-styles";

export const metadata: Metadata = buildPageMetadata({
  title: "Learn MasterSauce | AI Music Mastering Guides",
  description:
    "Guides for making AI-generated and independent music sound more professional, release-ready, and competitive — mastering, loudness, Song Architect, and Hit Analyzer.",
  path: "/learn",
  absoluteTitle: true
});

const hubIntroStyle = { margin: "0 auto", maxWidth: "56ch", fontSize: "1.0625rem", lineHeight: 1.68, color: "#9ca8cc", textAlign: "center" as const };

type LearnArticleCard = {
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  readingTime: string;
  cta: string;
  featured?: boolean;
};

const TOPIC_SECTIONS = [
  {
    title: "What mastering does",
    body: "Mastering is the final polish pass before release. It balances loudness, tone, and dynamics so your track feels cohesive on headphones, speakers, and streaming platforms — without undoing the creative mix you already built."
  },
  {
    title: "How reference-guided mastering works",
    body: "Upload a reference track or name an artist whose tone you admire. MasterSauce uses that direction to steer EQ, loudness, and punch — a creative shortcut when you know the vibe but not the technical chain."
  },
  {
    title: "How to prepare your track before upload",
    body: "Export a clean stereo mix with headroom (avoid clipping), skip heavy limiting on the mix bus, and choose WAV when possible. A well-prepared upload gives the engine more room to shape a professional-sounding master."
  },
  {
    title: "How to read loudness, dynamics, and bit depth",
    body: "Integrated LUFS tells you how loud a track feels on streaming. Crest factor reflects punch and breathing room. Bit depth (16-, 24-, or 32-bit float WAV) affects export fidelity — higher tiers unlock deeper formats for serious releases."
  },
  {
    title: "How Song Architect helps improve lyrics and structure",
    body: "Song Architect turns rough ideas into structured blueprints — hooks, verse/chorus flow, genre fit, and ready-to-paste prompts for Suno or Udio. Use it before you generate or record to make stronger songwriting decisions."
  },
  {
    title: "How Hit Analyzer evaluates release readiness",
    body: "Hit Analyzer delivers an A&R-style release readiness report based on audio features, commercial songwriting principles, and streaming behavior. It highlights strengths, gaps, and improvement opportunities — not hit prediction."
  }
] as const;

const articles: LearnArticleCard[] = [
  {
    title: "Why AI Songs Sound Bad (And How to Fix Them in 2 Minutes)",
    slug: "why-ai-songs-sound-bad",
    excerpt:
      "AI-generated songs often sound flat or unfinished. Learn why that happens and how to fix it fast with the right mastering approach.",
    date: "April 21, 2026",
    readingTime: "5 min read",
    cta: "Fix your AI song →",
    featured: true
  },
  {
    title: "Best Mastering for Suno AI Songs",
    slug: "best-mastering-for-suno-ai-songs",
    excerpt:
      "Suno songs can sound strong creatively but still need polish. Learn how mastering helps make Suno tracks louder, cleaner, and more release-ready.",
    date: "April 21, 2026",
    readingTime: "6 min read",
    cta: "Improve your sound →"
  },
  {
    title: "How to Make Your Song Spotify-Ready (LUFS, Loudness & Clarity Explained)",
    slug: "spotify-ready-mastering",
    excerpt: "Learn how to make your track Spotify-ready with the right LUFS, loudness balance, and mastering choices.",
    date: "April 21, 2026",
    readingTime: "7 min read",
    cta: "Make your track release-ready →"
  },
  {
    title: "AI Mastering Explained: What It Actually Does to Your Song",
    slug: "ai-mastering-explained",
    excerpt: "Understand what AI mastering actually changes in loudness, dynamics, EQ balance, and stereo image.",
    date: "April 21, 2026",
    readingTime: "6 min read",
    cta: "Understand mastering better →"
  }
];

export default function LearnHubPage() {
  return (
    <main style={mainStyle}>
      <MasterSauceBrandNav backHref="/" backLabel="Master a song" />

      <header style={heroStyle}>
        <MasterSauceBrandHeroLogo priority />
        <p style={eyebrowStyle}>Learn</p>
        <h1 style={h1Style}>Learn MasterSauce</h1>
        <p style={hubIntroStyle}>
          Guides for making AI-generated and independent music sound more professional, release-ready, and competitive.
        </p>
      </header>

      <section style={topicSectionStyle} aria-labelledby="learn-topics-heading">
        <h2 id="learn-topics-heading" style={h2Style}>
          Core concepts
        </h2>
        <div style={topicGridStyle}>
          {TOPIC_SECTIONS.map((topic) => (
            <article key={topic.title} style={topicCardStyle}>
              <h3 style={topicCardTitleStyle}>{topic.title}</h3>
              <p style={topicCardBodyStyle}>{topic.body}</p>
            </article>
          ))}
        </div>
        <div style={disclaimerBoxStyle}>
          <p style={disclaimerTextStyle}>
            <strong style={{ color: "#e4e9ff" }}>Why MasterSauce does not promise hits.</strong> No tool can guarantee
            chart success. MasterSauce helps you make better creative and release decisions — clearer masters, stronger
            song structure, and A&R-style feedback you can act on before you ship.
          </p>
        </div>
      </section>

      <section aria-labelledby="learn-articles-heading">
        <h2 id="learn-articles-heading" style={h2Style}>
          Guides
        </h2>
        <ul style={articleCardListStyle}>
          {articles.map((article) => (
            <li
              key={article.slug}
              style={
                article.featured
                  ? {
                      ...articleCardStyle,
                      border: "1px solid rgba(143, 98, 255, 0.6)",
                      boxShadow: "0 18px 42px rgba(56, 40, 124, 0.45)"
                    }
                  : articleCardStyle
              }
            >
              {article.featured ? <span style={featuredPillStyle}>Featured</span> : null}
              <h3 style={{ ...articleCardTitleStyle, marginTop: article.featured ? "12px" : "0" }}>
                <Link href={`/learn/${article.slug}`} style={articleCardTitleLinkStyle}>
                  {article.title}
                </Link>
              </h3>
              <p style={articleCardMetaRowStyle}>
                <span>{article.date}</span>
                <span style={articleCardMetaDotStyle} aria-hidden>
                  ·
                </span>
                <span>{article.readingTime}</span>
              </p>
              <p style={articleCardDescStyle}>{article.excerpt}</p>
              <Link href={`/learn/${article.slug}`} style={articleCardReadStyle}>
                {article.cta}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section style={ctaSectionStyle} aria-labelledby="learn-hub-cta-heading">
        <h2 id="learn-hub-cta-heading" style={ctaHeadingStyle}>
          Put these ideas into practice
        </h2>
        <p style={ctaBodyStyle}>
          Master a track, shape a stronger song, or get release readiness feedback — all part of the same workflow.
        </p>
        <div style={ctaRowStyle}>
          <Link href="/" style={ctaPrimaryStyle}>
            Master a Song
          </Link>
          <Link href="/song-architect" style={ctaSecondaryStyle}>
            Try Song Architect
          </Link>
          <Link href="/ar-ai" style={ctaTertiaryStyle}>
            Try Hit Analyzer
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
    </main>
  );
}
