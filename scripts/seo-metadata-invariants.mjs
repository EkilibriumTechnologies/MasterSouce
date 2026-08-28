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
  const page = read("app/ar-ai/page.tsx");
  const helper = read("lib/seo/page-metadata.ts");

  const expectedTitle = "AI Song Analyzer & A&R Report | MasterSauce";
  const expectedDescription =
    "Analyze your song with AI for an A&R-style report on hook strength, production quality, replay value, playlist fit, and release readiness. No hit predictions.";

  assertIncludes(layout, expectedTitle, "Hit Analyzer title");
  assertIncludes(layout, expectedDescription, "Hit Analyzer description");
  assertIncludes(layout, 'const path = "/ar-ai"', "Hit Analyzer canonical path");
  assertIncludes(layout, "buildPageMetadata", "Hit Analyzer uses metadata helper");
  assertIncludes(layout, "getProductWebAppJsonLd", "Hit Analyzer emits product web-app schema");
  assert.equal((page.match(/<h1\b/g) ?? []).length, 1, "Hit Analyzer must have exactly one H1");
  assertIncludes(page, "AI Song Analyzer — MasterSauce Hit Analyzer", "Hit Analyzer H1 matches primary intent");
  assertIncludes(page, 'href="/#master"', "Hit Analyzer links to mastering workspace");
  assertIncludes(page, 'href="/pricing"', "Hit Analyzer links to pricing");
  assertIncludes(page, 'href="/song-architect"', "Hit Analyzer links to Song Architect");
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

  assertIncludes(layout, "AI Song Structure Generator & Songwriting Planner | MasterSauce", "Song Architect unique title");
  assertIncludes(layout, "Plan a song before you generate it.", "Song Architect description matches planning intent");
  assertIncludes(layout, 'const path = "/song-architect"', "Song Architect canonical path");
  assertIncludes(layout, "buildPageMetadata", "Song Architect uses metadata helper");
  assertIncludes(layout, "getProductWebAppJsonLd", "Song Architect emits product web-app schema");
  assert.equal((page.match(/<h1\b/g) ?? []).length, 1, "Song Architect must have exactly one H1");
  assertIncludes(page, "AI Song Structure Generator for Better Song Blueprints", "Song Architect H1 matches primary intent");
  assertIncludes(page, "Udio", "Song Architect copy keeps broader generator compatibility");
  assertIncludes(page, 'href="/suno-mastering"', "Song Architect links to Suno landing page");
  assertIncludes(page, 'href="/ar-ai"', "Song Architect links to Hit Analyzer");
  assertIncludes(page, 'href="/#master"', "Song Architect links to mastering workspace");
  assertIncludes(page, 'href="/pricing"', "Song Architect links to pricing");
}

function runProductSchemaAndIndexabilityTests() {
  const arLayout = read("app/ar-ai/layout.tsx");
  const architectLayout = read("app/song-architect/layout.tsx");
  const schemaHelper = read("lib/seo/product-web-app-json-ld.ts");
  const sitemap = read("app/sitemap.ts");
  const robots = read("app/robots.ts");
  const relatedMetadata = [
    read("app/page.tsx"),
    read("app/suno-mastering/page.tsx"),
    read("app/suno-song-analyzer/page.tsx"),
    read("app/learn/page.tsx"),
    read("app/learn/why-ai-songs-sound-bad/page.tsx"),
    read("app/learn/best-mastering-for-suno-ai-songs/page.tsx"),
    read("app/learn/spotify-ready-mastering/page.tsx"),
    read("app/learn/ai-mastering-explained/page.tsx")
  ].join("\n");

  const arTitle = "AI Song Analyzer & A&R Report | MasterSauce";
  const arDescription =
    "Analyze your song with AI for an A&R-style report on hook strength, production quality, replay value, playlist fit, and release readiness. No hit predictions.";
  const architectTitle = "AI Song Structure Generator & Songwriting Planner | MasterSauce";
  const architectDescription =
    "Plan a song before you generate it. Build structure, lyrics, hooks, energy curves, vocal direction, genre guidance, and prompts for Suno, Udio, and other AI music tools.";

  assert.notEqual(arTitle, architectTitle, "target product titles must be unique");
  assert.notEqual(arDescription, architectDescription, "target product descriptions must be unique");
  assert.ok(!relatedMetadata.includes(arTitle), "Hit Analyzer title must be unique among related pages");
  assert.ok(!relatedMetadata.includes(arDescription), "Hit Analyzer description must be unique among related pages");
  assert.ok(!relatedMetadata.includes(architectTitle), "Song Architect title must be unique among related pages");
  assert.ok(!relatedMetadata.includes(architectDescription), "Song Architect description must be unique among related pages");
  assertExcludes(arLayout, "noIndex", "Hit Analyzer remains indexable");
  assertExcludes(architectLayout, "noIndex", "Song Architect remains indexable");
  assertExcludes(arLayout, "localhost", "Hit Analyzer has no localhost canonical");
  assertExcludes(architectLayout, "localhost", "Song Architect has no localhost canonical");
  assertIncludes(sitemap, '"/ar-ai"', "sitemap includes Hit Analyzer");
  assertIncludes(sitemap, '"/song-architect"', "sitemap includes Song Architect");
  assertExcludes(robots, "ar-ai", "robots does not disallow Hit Analyzer");
  assertExcludes(robots, "song-architect", "robots does not disallow Song Architect");
  assertIncludes(schemaHelper, '"@type": "WebPage"', "product schema includes WebPage");
  assertIncludes(schemaHelper, '"@type": "WebApplication"', "product schema includes WebApplication");
  assertIncludes(schemaHelper, "featureList", "product schema describes visible features");
  assertExcludes(schemaHelper, "AggregateRating", "product schema has no unsupported ratings");
  assertExcludes(schemaHelper, '"@type": "Review"', "product schema has no unsupported reviews");
  assertExcludes(schemaHelper, '"@type": "Offer"', "product schema has no unsupported offer");
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

function runSunoSongAnalyzerPageTests() {
  const page = read("app/suno-song-analyzer/page.tsx");
  const sitemap = read("app/sitemap.ts");
  const robots = read("app/robots.ts");
  const site = read("lib/site.ts");
  const existingPages = [
    read("app/ar-ai/layout.tsx"),
    read("app/suno-mastering/page.tsx"),
    read("app/learn/best-mastering-for-suno-ai-songs/page.tsx"),
    read("app/learn/why-ai-songs-sound-bad/page.tsx")
  ].join("\n");
  const expectedTitle = "Suno Song Analyzer | Analyze AI-Generated Music | MasterSauce";
  const expectedDescription =
    "Upload a Suno-generated track for an A&R-style report on production quality, hooks, replay value, playlist fit, and release readiness before mastering or release.";

  assertIncludes(page, "buildPageMetadata", "Suno song analyzer uses metadata helper");
  assertIncludes(page, `const title = "${expectedTitle}"`, "Suno song analyzer unique title");
  assertIncludes(page, expectedDescription, "Suno song analyzer unique description");
  assertIncludes(page, 'const path = "/suno-song-analyzer"', "Suno song analyzer canonical path");
  assertIncludes(page, "absoluteTitle: true", "Suno song analyzer uses absolute title");
  assertIncludes(page, "absoluteUrl(path)", "Suno song analyzer schema uses canonical URL");
  assertIncludes(site, '"https://www.mastersauce.ai"', "Suno song analyzer canonical resolves to production www host");
  assertExcludes(page, "localhost", "Suno song analyzer has no localhost canonical");
  assertExcludes(page, "noIndex", "Suno song analyzer remains indexable");
  assert.equal((page.match(/<h1\b/g) ?? []).length, 1, "Suno song analyzer must have exactly one H1");
  assertIncludes(page, ">Suno Song Analyzer</h1>", "Suno song analyzer H1 matches primary keyword");
  assert.ok(!existingPages.includes(expectedTitle), "Suno song analyzer title must be unique among related pages");
  assert.ok(!existingPages.includes(expectedDescription), "Suno song analyzer description must be unique among related pages");
  assertIncludes(page, "const faqItems: FaqItem[]", "Suno song analyzer has one visible FAQ source");
  assertIncludes(page, "<FAQSchema", "Suno song analyzer emits FAQPage schema");
  assertIncludes(page, "<FaqSection items={faqItems}", "Suno song analyzer renders matching visible FAQ");
  assertIncludes(page, "faq={faqItems}", "Suno song analyzer schema uses the visible FAQ source");
  assert.equal((page.match(/question: "/g) ?? []).length, 5, "Suno song analyzer has five FAQ questions");
  assertIncludes(page, 'href="/ar-ai"', "Suno song analyzer links to the actual Hit Analyzer");
  assertIncludes(page, 'href="/suno-mastering"', "Suno song analyzer links to Suno mastering");
  assertIncludes(page, 'href="/song-architect"', "Suno song analyzer links to Song Architect");
  assertIncludes(page, 'href="/pricing"', "Suno song analyzer links to pricing");
  assertIncludes(page, 'href="/#master"', "Suno song analyzer links to mastering workspace");
  assertIncludes(page, "not affiliated with", "Suno song analyzer includes independent-product disclaimer");
  assertIncludes(sitemap, '"/suno-song-analyzer"', "sitemap includes Suno song analyzer");
  assertIncludes(robots, 'allow: "/"', "robots permits public routes");
  assertExcludes(robots, "suno-song-analyzer", "robots does not disallow Suno song analyzer");
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
  runProductSchemaAndIndexabilityTests();
  runSunoMasteringPageTests();
  runSunoSongAnalyzerPageTests();
  runApexWwwRedirectConfigTests();
  console.log("seo-metadata-invariants: ok");
}

run();
