import type { Metadata } from "next";
import Link from "next/link";

import { FaqSection } from "@/components/learn/faq-section";
import { ArticleSchema } from "@/components/seo/article-schema";
import { FAQSchema, type FaqItem } from "@/components/seo/faq-schema";
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

const path = "/learn/spotify-ready-mastering";
const publishedDate = "2026-04-21";
const title = "How to Make Your Song Spotify-Ready (LUFS, Loudness & Clarity Explained)";
const description =
  "Learn how to make your song Spotify-ready with the right loudness, LUFS targets, and mastering techniques for better playback.";
const faqItems: FaqItem[] = [
  {
    question: "What LUFS level should I target for Spotify?",
    answer:
      "There is no single perfect number for every song, but a balanced master near Spotify-normalized playback generally performs better than over-limited loudness."
  },
  {
    question: "Why does my song sound quieter on Spotify than in my DAW?",
    answer:
      "Spotify uses loudness normalization. If your file is pushed too hard, it can be turned down while keeping distortion or harshness."
  },
  {
    question: "How do I make my track Spotify-ready?",
    answer:
      "Focus on controlled loudness, clear mids, stable dynamics, and clean translation across devices, then compare before and after mastering."
  },
  {
    question: "Why do AI songs struggle on streaming platforms?",
    answer:
      "AI tracks often have inconsistent dynamics, harsh highs, or muddy balance that become more obvious next to professionally mastered songs."
  }
];

export const metadata: Metadata = buildPageMetadata({
  title: "How to Make Your Song Spotify-Ready | LUFS, Loudness & Clarity",
  description,
  path
});

export default function SpotifyReadyMasteringPage() {
  return (
    <>
      <ArticleSchema title={title} description={description} date={publishedDate} url={absoluteUrl(path)} />
      <FAQSchema title={title} description={description} date={publishedDate} url={absoluteUrl(path)} faq={faqItems} />
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
          <h1 style={{ ...h1Style, maxWidth: "28ch" }}>
            How to Make Your Song Spotify-Ready (LUFS, Loudness & Clarity Explained)
          </h1>
        </header>

        <article style={articleStyle}>
          <p style={pStyle}>
            Getting a song Spotify-ready is less about chasing maximum loudness and more about balance. You want competitive
            energy, clean translation across devices, and a master that still feels musical after loudness normalization.
          </p>
          <p style={pStyle}>
            If your AI export sounds promising but not finished, start with{" "}
            <Link href="/learn/why-ai-songs-sound-bad" style={inlineLinkStyle}>
              why AI songs sound bad
            </Link>
            . Then use this guide to dial in streaming-specific decisions.
          </p>

          <h2 style={h2Style}>LUFS and Why Spotify Loudness Normalization Matters</h2>
          <p style={pStyle}>
            LUFS is a way to measure perceived loudness. Spotify and other streaming platforms use loudness normalization, so a
            hotter file is not always better. If you over-push a master, platforms can turn it down while leaving the
            distortion and reduced dynamics in place.
          </p>
          <p style={pStyle}>
            The goal is controlled loudness, not crushed loudness. You want a track that feels strong before and after
            normalization.
          </p>

          <h2 style={h2Style}>What Makes a Song Feel Spotify-Ready</h2>
          <ul style={listStyle}>
            <li style={listItemStyle}>consistent loudness from intro to drop to outro</li>
            <li style={listItemStyle}>clear mids so vocals and hooks stay forward</li>
            <li style={listItemStyle}>controlled peaks that do not feel jumpy or brittle</li>
            <li style={listItemStyle}>low-end that feels full but not boomy</li>
            <li style={listItemStyle}>a master that translates across earbuds, phones, laptops, and cars</li>
          </ul>

          <h2 style={h2Style}>How Streaming Platforms Expose Weak Masters</h2>
          <h3 style={h3Style}>Normalization reveals harshness</h3>
          <p style={pStyle}>
            A brittle or over-limited track can sound fatiguing once level-matched against cleaner songs in playlists.
          </p>
          <h3 style={h3Style}>Inconsistent dynamics feel amateur</h3>
          <p style={pStyle}>
            Big swings in energy can make a track feel unstable when listeners compare it to polished releases.
          </p>
          <h3 style={h3Style}>Poor clarity loses attention</h3>
          <p style={pStyle}>
            If vocals or lead elements sit behind muddy mids, listeners often skip quickly, even when the song idea is strong.
          </p>

          <h2 style={h2Style}>Why AI Songs Often Struggle with Spotify Standards</h2>
          <p style={pStyle}>
            AI-generated tracks are usually strong on ideas but inconsistent on final balance. Common issues include soft
            perceived loudness, edgy highs, low-end blur, and unstable section-to-section energy.
          </p>
          <p style={pStyle}>
            Those issues are exactly what Spotify playback environments expose. The track might feel okay solo, then feel
            weaker next to professionally mastered songs.
          </p>

          <h2 style={h2Style}>Simple Spotify-Ready Mastering Workflow</h2>
          <ul style={listStyle}>
            <li style={listItemStyle}>Export your final mix or AI output</li>
            <li style={listItemStyle}>Run a mastering pass focused on loudness and clarity</li>
            <li style={listItemStyle}>A/B the original and mastered versions at matched listening level</li>
            <li style={listItemStyle}>Choose the version that feels cleaner and more consistent, not just louder</li>
          </ul>

          <h2 style={h2Style}>Where MasterSauce Fits</h2>
          <p style={pStyle}>
            MasterSauce helps you preview whether your track is moving toward a Spotify-ready result before you commit. Start
            in the <Link href="/#master" style={inlineLinkStyle}>mastering flow</Link> and compare before/after with your own
            ears.
          </p>
        </article>

        <section style={ctaSectionStyle} aria-labelledby="spotify-ready-cta-heading">
          <h2 id="spotify-ready-cta-heading" style={ctaHeadingStyle}>
            Make your next release Spotify-ready with more confidence
          </h2>
          <p style={ctaBodyStyle}>Hear loudness, clarity, and balance changes before downloading your final master.</p>
          <div style={ctaRowStyle}>
            <Link href="/#master" style={ctaPrimaryStyle}>
              Try MasterSauce
            </Link>
            <Link href="/pricing" style={ctaSecondaryStyle}>
              View pricing
            </Link>
          </div>
        </section>
        <FaqSection items={faqItems} />
      </main>
    </>
  );
}
