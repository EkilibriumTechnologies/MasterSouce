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

  assertIncludes(metadataBlock, 'absoluteUrl("/og-image.png")', "homepage og:image");
  assertIncludes(metadataBlock, 'card: "summary_large_image"', "homepage twitter card");
  assertExcludes(metadataBlock, "mastersauce-logo.png", "homepage metadata must not use logo as og:image");
}

function run() {
  runPageMetadataHelperTests();
  runHitAnalyzerMetadataTests();
  runHomepageMetadataTests();
  console.log("seo-metadata-invariants: ok");
}

run();
