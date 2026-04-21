import type { Metadata } from "next";
import Link from "next/link";

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
  backLinkStyle,
  ctaBodyStyle,
  ctaHeadingStyle,
  ctaPrimaryStyle,
  ctaRowStyle,
  ctaSecondaryStyle,
  ctaSectionStyle,
  eyebrowStyle,
  featuredPillStyle,
  h1Style,
  h2Style,
  heroStyle,
  introStyle,
  mainStyle,
  topNavStyle
} from "./learn-styles";

export const metadata: Metadata = buildPageMetadata({
  title: "Music Mastering Guides",
  description:
    "Explore practical guides on streaming readiness, AI music mastering, loudness, and preparing tracks for release.",
  path: "/learn"
});

const hubIntroStyle = { ...introStyle, textAlign: "center" as const };

type LearnArticleCard = {
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  readingTime: string;
  cta: string;
  featured?: boolean;
};

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
      <nav style={topNavStyle} aria-label="Site">
        <Link href="/" style={backLinkStyle}>
          ← Back to MasterSauce
        </Link>
      </nav>

      <header style={heroStyle}>
        <p style={eyebrowStyle}>Resources</p>
        <h1 style={h1Style}>Music Mastering Guides</h1>
        <p style={hubIntroStyle}>
          Learn more about what makes a track feel ready for release. These short guides cover streaming readiness, AI music
          mastering, loudness, and practical topics that help creators make stronger release decisions.
        </p>
      </header>

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
        <p style={ctaBodyStyle}>Analyze your track and hear how it responds before you release.</p>
        <div style={ctaRowStyle}>
          <Link href="/#master" style={ctaPrimaryStyle}>
            Analyze your track
          </Link>
          <Link href="/pricing" style={ctaSecondaryStyle}>
            View pricing
          </Link>
        </div>
      </section>
    </main>
  );
}
