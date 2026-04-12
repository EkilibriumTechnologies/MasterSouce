import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { getLearnArticleJsonLd } from "@/lib/seo/learn-article-json-ld";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

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

const path = "/learn/streaming-ready-master";

export const metadata: Metadata = buildPageMetadata({
  title: "What Makes a Track Streaming-Ready?",
  description:
    "Learn what makes a song streaming-platform ready, including loudness, peaks, clarity, balance, and why analyzing your track before release can help.",
  path
});

export default function StreamingReadyMasterPage() {
  return (
    <>
      <JsonLd
        data={getLearnArticleJsonLd({
          path,
          headline: "What Makes a Track Streaming-Ready?",
          description:
            "Learn what makes a song streaming-platform ready, including loudness, peaks, clarity, balance, and why analyzing your track before release can help."
        })}
      />
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
          <h1 style={{ ...h1Style, maxWidth: "28ch" }}>What Makes a Track Streaming-Ready?</h1>
        </header>

        <article style={articleStyle}>
          <p style={pStyle}>
            A song can sound good in your studio and still fall apart when it hits streaming platforms. Sometimes it sounds
            too quiet. Sometimes it feels harsh, flat, weak, or inconsistent next to commercial releases. That does not
            always mean the song is bad. It often means the final master is not fully ready for release.
          </p>
          <p style={pStyle}>
            At a basic level, a streaming-ready master is a version of your track that holds up across platforms, devices, and
            listening environments. It should sound clear, controlled, balanced, and competitive without being crushed or
            distorted.
          </p>

          <h2 style={h2Style}>Why “streaming-ready” is more than just loudness</h2>
          <p style={pStyle}>
            A lot of people reduce mastering to one question: “Is it loud enough?” Loudness matters, but it is only part of
            the picture. A track can be loud and still feel small, harsh, muddy, or unstable. Streaming readiness is really
            about how the full track translates when people hear it on phones, earbuds, laptops, cars, and speakers.
          </p>
          <p style={pStyle}>
            A strong release-ready master usually has a healthy balance between loudness, dynamics, clarity, low-end control,
            and peak management. If any of those are off, the result can feel amateur even if the song itself is strong.
          </p>

          <h2 style={h2Style}>Common reasons a track does not feel ready</h2>

          <h3 style={h3Style}>Too quiet next to other songs</h3>
          <p style={pStyle}>
            One of the most common complaints is that a track feels weaker or smaller than surrounding songs on a playlist.
            That can happen because the perceived loudness is too low, the density is off, or the tonal balance is not
            helping the song feel full and present.
          </p>

          <h3 style={h3Style}>Too loud or overly crushed</h3>
          <p style={pStyle}>
            Going too hard can also backfire. When a master is pushed too far, it can lose punch, depth, and emotion. The
            song may technically measure loud, but it can feel tiring, flat, or distorted.
          </p>

          <h3 style={h3Style}>Peaks are not controlled well</h3>
          <p style={pStyle}>
            Uncontrolled peaks can make a song feel unstable. A track may jump in ways that make it harder to hold together
            across playback systems, especially when compared to polished commercial music.
          </p>

          <h3 style={h3Style}>Lack of tonal balance and clarity</h3>
          <p style={pStyle}>
            If the low end is messy, the mids are crowded, or the top end is harsh, the track may not translate well. It can
            sound decent in one setup and broken in another.
          </p>

          <h2 style={h2Style}>What to look at before releasing a track</h2>
          <p style={pStyle}>Before releasing a song, it helps to look at a few key signals:</p>
          <ul style={listStyle}>
            <li style={listItemStyle}>overall loudness</li>
            <li style={listItemStyle}>peak behavior</li>
            <li style={listItemStyle}>clarity and tonal balance</li>
            <li style={listItemStyle}>whether the track feels controlled or erratic</li>
            <li style={listItemStyle}>whether it holds up next to reference songs in your genre</li>
          </ul>
          <p style={pStyle}>
            This is where track analysis becomes useful. Instead of guessing, you can get a clearer picture of whether your
            song feels release-ready or whether it still needs work before it goes live.
          </p>

          <h2 style={h2Style}>Why analysis before release helps</h2>
          <p style={pStyle}>
            A lot of artists and producers upload first and realize later that their track does not hit the same way as other
            releases. Analyzing before release helps catch obvious issues early. It can save you from putting out a song that
            feels quieter, harsher, or less polished than it should.
          </p>
          <p style={pStyle}>
            Even a fast pre-release check can help you decide whether your track is ready as-is or whether it would benefit
            from stronger mastering.
          </p>

          <h2 style={h2Style}>Where MasterSauce fits in</h2>
          <p style={pStyle}>
            MasterSauce helps you evaluate and improve your track before release. If you want a fast way to hear whether your
            song is moving in the right direction, you can{" "}
            <Link href="/#master" style={inlineLinkStyle}>
              analyze it
            </Link>{" "}
            and preview how it responds before making a final decision.
          </p>
          <p style={pStyle}>That makes it easier to release with more confidence instead of guessing.</p>
          <p style={pStyle}>
            See <Link href="/pricing" style={inlineLinkStyle}>pricing</Link> when you are ready to compare plans, or return to
            the <Link href="/" style={inlineLinkStyle}>homepage</Link> for an overview.
          </p>
        </article>

        <section style={ctaSectionStyle} aria-labelledby="streaming-cta-heading">
          <h2 id="streaming-cta-heading" style={ctaHeadingStyle}>
            Check if your track feels release-ready
          </h2>
          <p style={ctaBodyStyle}>
            Get a better sense of whether your song sounds ready before it goes live.
          </p>
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
    </>
  );
}
