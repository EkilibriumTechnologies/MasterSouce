import type { Metadata } from "next";
import Link from "next/link";

import { buildPageMetadata } from "@/lib/seo/page-metadata";

import {
  articleCardDescStyle,
  articleCardListStyle,
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
          <li style={articleCardStyle}>
            <h3 style={articleCardTitleStyle}>
              <Link href="/learn/streaming-ready-master" style={articleCardTitleLinkStyle}>
                What Makes a Track Streaming-Ready?
              </Link>
            </h3>
            <p style={articleCardDescStyle}>
              Learn why loudness alone is not enough and what to check before releasing a song.
            </p>
            <Link href="/learn/streaming-ready-master" style={articleCardReadStyle}>
              Read guide →
            </Link>
          </li>
          <li style={articleCardStyle}>
            <h3 style={articleCardTitleStyle}>
              <Link href="/learn/ai-music-still-needs-mastering" style={articleCardTitleLinkStyle}>
                Why AI Music Still Needs Mastering
              </Link>
            </h3>
            <p style={articleCardDescStyle}>
              Learn why generated music can still benefit from a finishing step before release.
            </p>
            <Link href="/learn/ai-music-still-needs-mastering" style={articleCardReadStyle}>
              Read guide →
            </Link>
          </li>
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
