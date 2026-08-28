import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const ROOT = process.cwd();

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
}

function assertExcludes(content, needle, context) {
  assert.ok(!content.includes(needle), `${context}: must not include "${needle}"`);
}

function runPageMetadataHelperTests() {
  const helper = read("lib/seo/page-metadata.ts");
  const site = read("lib/site.ts");

  assertIncludes(helper, 'DEFAULT_SOCIAL_PREVIEW_PATH = "/og-image.png"', "default social preview path");
  assertIncludes(helper, "socialImagePath", "optional page-specific social image");
  assertIncludes(helper, "SOCIAL_PREVIEW_SIZE", "openGraph image dimensions");
  assertIncludes(helper, "SOCIAL_PREVIEW_ALT", "openGraph image alt text");
  assertIncludes(helper, 'card: "summary_large_image"', "twitter card type");
  assertIncludes(helper, "openGraph:", "openGraph block");
  assertIncludes(helper, "images: [", "openGraph images array");
  assertIncludes(helper, "twitter:", "twitter block");
  assertIncludes(helper, "images: [socialImageUrl]", "twitter images array");
  assertIncludes(helper, "alternates: { canonical: url }", "absolute canonical URL");
  assertIncludes(site, '"https://www.mastersauce.ai"', "canonical production fallback");
  assertExcludes(site, '"http://localhost:3000"', "canonical helper must not fall back to localhost");
}

function runHitAnalyzerMetadataTests() {
  const layout = read("app/ar-ai/layout.tsx");
  const helper = read("lib/seo/page-metadata.ts");

  const expectedTitle = "MasterSauce Hit Analyzer | A&R-Style Release Readiness Report";
  const expectedDescription =
    "Get a professional A&R-style report for your song. It does not predict hits — it evaluates hook strength, production quality, replay value, playlist fit, and commercial readiness.";

  assertIncludes(layout, expectedTitle, "Hit Analyzer og:title");
  assertIncludes(layout, expectedDescription, "Hit Analyzer og:description");
  assertIncludes(layout, 'path: "/ar-ai"', "Hit Analyzer canonical path");
  assertIncludes(layout, "buildPageMetadata", "Hit Analyzer uses metadata helper");
  assertExcludes(layout, "mastersauce-logo.png", "Hit Analyzer layout must not set logo as og:image");
  assertIncludes(helper, 'DEFAULT_SOCIAL_PREVIEW_PATH = "/og-image.png"', "helper default og:image");
}

function runHomepageMetadataTests() {
  const home = read("app/page.tsx");
  const metadataBlock = home.slice(home.indexOf("export const metadata"), home.indexOf("export default"));
  const site = read("lib/site.ts");

  assertIncludes(metadataBlock, 'absoluteUrl("/og-image.png")', "homepage og:image");
  assertIncludes(metadataBlock, 'card: "summary_large_image"', "homepage twitter card");
  assertExcludes(metadataBlock, "mastersauce-logo.png", "homepage metadata must not use logo as og:image");
  assertIncludes(metadataBlock, "Suno", "homepage title includes Suno");
  assertIncludes(site, "Suno creators", "default site description mentions Suno creators");
  assertIncludes(home, "Create with Suno. Finish with MasterSauce.", "homepage hero includes Suno eyebrow");
  assertIncludes(home, 'href="/suno-mastering"', "homepage links to Suno landing page");
}

function runSongArchitectMetadataTests() {
  const layout = read("app/song-architect/layout.tsx");
  const page = read("app/song-architect/page.tsx");

  assertIncludes(layout, "Suno Song Architect | Prompts, Lyrics & Song Structure | MasterSauce", "Song Architect title includes Suno");
  assertIncludes(layout, "Build better Suno songs before you generate.", "Song Architect description includes Suno");
  assertIncludes(layout, 'path: "/song-architect"', "Song Architect canonical path");
  assertIncludes(layout, "buildPageMetadata", "Song Architect uses metadata helper");
  assertIncludes(page, "Build Better Suno Songs Before You Generate", "Song Architect H1 includes Suno");
  assertIncludes(page, "Udio", "Song Architect copy keeps broader generator compatibility");
  assertIncludes(page, 'href="/suno-mastering"', "Song Architect links to Suno landing page");
}

function runSunoMasteringPageTests() {
  const page = read("app/suno-mastering/page.tsx");
  const sitemap = read("app/sitemap.ts");
  const robots = read("app/robots.ts");

  assertIncludes(page, "buildPageMetadata", "Suno mastering page uses metadata helper");
  assertIncludes(page, "AI Mastering for Suno Songs | MasterSauce", "Suno mastering unique title");
  assertIncludes(page, 'const path = "/suno-mastering"', "Suno mastering canonical path");
  assertIncludes(page, "path,", "Suno mastering passes path to metadata helper");
  assertIncludes(page, "absoluteTitle: true", "Suno mastering title is absolute");
  assertExcludes(page, "noIndex", "Suno mastering page must remain indexable");
  assertIncludes(page, "AI Mastering for Suno Songs", "Suno mastering H1");
  assertIncludes(page, "Do Suno songs need mastering?", "Suno mastering visible FAQ covers need");
  assertIncludes(page, "Can I master a Suno song before Spotify distribution?", "Suno mastering visible FAQ covers distribution");
  assertIncludes(page, "Should I use WAV when mastering an AI-generated song?", "Suno mastering visible FAQ covers source format");
  assertIncludes(page, "What does MasterSauce analyze before mastering?", "Suno mastering visible FAQ covers analysis");
  assertIncludes(page, "Is MasterSauce part of Suno?", "Suno mastering visible FAQ covers affiliation");
  assertIncludes(page, 'href="/song-architect"', "Suno mastering links to Song Architect");
  assertIncludes(page, 'href="/ar-ai"', "Suno mastering links to Analyze Your Song");
  assertIncludes(page, 'href="/#master"', "Suno mastering links to mastering");
  assertIncludes(page, 'href="/pricing"', "Suno mastering links to pricing");
  assertExcludes(page, "official Suno", "must not claim official Suno affiliation");
  assertExcludes(page, "Suno partner", "must not claim Suno partnership");
  assertExcludes(page, "built by Suno", "must not claim built by Suno");
  assertExcludes(page, "integrated with Suno", "must not claim Suno integration");
  assertIncludes(page, "not affiliated with", "includes independent-product language");
  assertIncludes(sitemap, '"/suno-mastering"', "sitemap includes /suno-mastering");
  assertIncludes(robots, "sitemap:", "robots points to sitemap");
  assertExcludes(robots, "suno-mastering", "robots does not disallow /suno-mastering");
}

function runApexWwwRedirectConfigTests() {
  const middleware = read("middleware.ts");
  const nextConfig = read("next.config.mjs");
  const helper = read("lib/http/apex-www-redirect.ts");

  assertIncludes(helper, 'APEX_PUBLIC_HOST = "mastersauce.ai"', "apex hostname constant");
  assertIncludes(helper, 'CANONICAL_PUBLIC_HOST = "www.mastersauce.ai"', "canonical www hostname constant");
  assertIncludes(middleware, "apexToWwwRedirectUrl", "middleware uses apex redirect helper");
  assertIncludes(middleware, 'request.headers.get("x-forwarded-host")', "middleware reads Railway x-forwarded-host");
  assertIncludes(middleware, "NextResponse.redirect(destination, 301)", "middleware issues permanent 301");
  assertExcludes(middleware, "www.mastersauce.ai\")", "middleware does not hardcode a host compare that would loop www");
  assertIncludes(helper, "x-forwarded-host", "helper documents forwarded-host detection");
  assertIncludes(helper, "resolveRequestHostname", "helper resolves host behind proxies");
  assertIncludes(nextConfig, 'value: "mastersauce.ai"', "next.config matches apex host");
  assertIncludes(nextConfig, "https://www.mastersauce.ai/:path*", "next.config preserves path when redirecting apex");
  assertExcludes(nextConfig, 'value: "www.mastersauce.ai"', "next.config does not redirect www onto itself");
}

function run() {
  runPageMetadataHelperTests();
  runHitAnalyzerMetadataTests();
  runHomepageMetadataTests();
  runSongArchitectMetadataTests();
  runSunoMasteringPageTests();
  runApexWwwRedirectConfigTests();
  console.log("seo-metadata-invariants: ok");
}

run();
