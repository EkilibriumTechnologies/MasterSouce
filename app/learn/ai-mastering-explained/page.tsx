import type { Metadata } from "next";
import Link from "next/link";

import { ArticleSchema } from "@/components/seo/article-schema";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { absoluteUrl } from "@/lib/site";

import {
  articleStyle,
  backLinkStyle,
  ctaBodyStyle,
  ctaHeadingStyle,
  ctaPrimaryStyle,
  ctaRowStyle,
  ctaSecondaryStyle,
  ctaSectionStyle,
  h1Style,
  h2Style,
  h3Style,
  heroStyle,
  inlineLinkStyle,
  listItemStyle,
  listStyle,
  mainStyle,
  navMutedStyle,
  pStyle,
  topNavStyle
} from "../learn-styles";

const path = "/learn/ai-mastering-explained";
const publishedDate = "2026-04-21";
const title = "AI Mastering Explained: What It Actually Does to Your Song";
const description =
  "Learn what AI mastering actually does to your track, how it affects loudness, clarity, and balance, and why it matters for release-ready music.";

export const metadata: Metadata = buildPageMetadata({
  title: "AI Mastering Explained | What Mastering Actually Does to Your Song",
  description,
  path
});

export default function AiMasteringExplainedPage() {
  return (
    <>
      <ArticleSchema title={title} description={description} date={publishedDate} url={absoluteUrl(path)} />
      <main style={mainStyle}>
        <nav style={topNavStyle} aria-label="Site">
          <Link href="/learn" style={backLinkStyle}>
            ← All guides
          </Link>
          <span style={navMutedStyle} aria-hidden>
            ·
          </span>
          <Link href="/" style={backLinkStyle}>
            Home
          </Link>
        </nav>

        <header style={heroStyle}>
          <h1 style={{ ...h1Style, maxWidth: "26ch" }}>AI Mastering Explained: What It Actually Does to Your Song</h1>
        </header>

        <article style={articleStyle}>
          <p style={pStyle}>
            AI mastering is often described as "make it louder," but that is only one part of the process. A good master is a
            set of small, coordinated decisions that shape how your song feels on real playback systems.
          </p>
          <p style={pStyle}>
            If you first want to diagnose common problems, start with{" "}
            <Link href="/learn/why-ai-songs-sound-bad" style={inlineLinkStyle}>
              why AI songs sound bad
            </Link>
            . This guide explains what mastering is actually doing under the hood.
          </p>

          <h2 style={h2Style}>Loudness: Competitive Level Without Killing the Song</h2>
          <p style={pStyle}>
            Loudness processing raises perceived level so your track does not feel weak in playlists. The goal is not maxed-out
            gain; it is stable, controlled energy that still breathes.
          </p>
          <p style={pStyle}>
            When pushed too hard, the track can lose punch, emotion, and depth. Good mastering finds the point where the song
            feels present but not crushed.
          </p>

          <h2 style={h2Style}>Dynamics: Controlling Movement and Impact</h2>
          <p style={pStyle}>
            Dynamics are the difference between soft and loud moments. Mastering shapes this movement so verses, choruses, and
            drops feel intentional instead of jumpy or flat.
          </p>
          <ul style={listStyle}>
            <li style={listItemStyle}>too much control can make the song lifeless</li>
            <li style={listItemStyle}>too little control can make levels feel chaotic</li>
            <li style={listItemStyle}>the sweet spot keeps impact while improving consistency</li>
          </ul>

          <h2 style={h2Style}>EQ Balance: Fixing Mud, Harshness, and Thinness</h2>
          <p style={pStyle}>
            EQ balance is about where your frequency energy sits. Mastering can clean muddiness in the mids, reduce harsh
            brightness, and support low-end weight without boom.
          </p>
          <p style={pStyle}>
            This is one reason a mastered track feels clearer at the same volume: important elements have more space.
          </p>

          <h2 style={h2Style}>Stereo Image: Width, Focus, and Translation</h2>
          <p style={pStyle}>
            Stereo image controls how wide or centered your song feels. Mastering can improve width and separation while
            protecting mono compatibility for phones, clubs, and other playback environments.
          </p>
          <p style={pStyle}>
            A balanced stereo field helps the song feel bigger without making vocals or core elements drift out of focus.
          </p>

          <h2 style={h2Style}>What AI Mastering Does Not Do</h2>
          <h3 style={h3Style}>It does not rewrite composition</h3>
          <p style={pStyle}>Mastering cannot fix weak songwriting, arrangement, or vocal performance choices.</p>
          <h3 style={h3Style}>It does not replace a solid source file</h3>
          <p style={pStyle}>
            If the export is severely distorted or imbalanced, mastering helps, but source quality still sets the ceiling.
          </p>

          <h2 style={h2Style}>Why This Matters for Release Decisions</h2>
          <p style={pStyle}>
            Understanding what mastering changes helps you judge results better. You stop asking "is it louder?" and start
            asking "does it feel clearer, more controlled, and more release-ready?"
          </p>
          <p style={pStyle}>
            That shift leads to better choices, especially when publishing often in AI workflows.
          </p>
        </article>

        <section style={ctaSectionStyle} aria-labelledby="ai-mastering-explained-cta-heading">
          <h2 id="ai-mastering-explained-cta-heading" style={ctaHeadingStyle}>
            Hear what AI mastering changes on your own track
          </h2>
          <p style={ctaBodyStyle}>Use before/after preview to evaluate loudness, dynamics, and clarity before committing.</p>
          <div style={ctaRowStyle}>
            <Link href="/#master" style={ctaPrimaryStyle}>
              Try MasterSauce
            </Link>
            <Link href="/pricing" style={ctaSecondaryStyle}>
              View pricing
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
