import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "promo-screenshots");
const mixPath = path.join(outDir, "test-mix.wav");
const referencePath = path.join(outDir, "test-reference.wav");
const baseUrl = process.env.MASTERSOUCE_SCREENSHOT_URL ?? "http://localhost:3000";

async function waitForAnalysis(page) {
  await page.getByRole("button", { name: /Analyze mix/i }).click();
  await page.getByRole("heading", { name: "Mix analysis" }).waitFor({ timeout: 120000 });
}

async function openAdaptiveSection(page) {
  const promptButton = page.getByRole("button", {
    name: "Adaptive customization — add written direction, then run a free preview"
  });
  await promptButton.scrollIntoViewIfNeeded();
  await promptButton.click();
  await page.getByLabel(/Notes for the adaptive engine/i).waitFor({ timeout: 15000 });
}

async function ensureAdvancedControlsOpen(page) {
  const toggle = page.getByRole("button", { name: "Advanced Controls" });
  await toggle.scrollIntoViewIfNeeded();
  const expanded = await toggle.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await toggle.click();
  }
  await page.locator("#adaptive-advanced-controls").waitFor({ timeout: 15000 });
}

const browser = await chromium.launch();
const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await desktop.goto(baseUrl, { waitUntil: "networkidle" });
await desktop.locator('input[type="file"]').first().setInputFiles(mixPath);
await waitForAnalysis(desktop);
await openAdaptiveSection(desktop);
await ensureAdvancedControlsOpen(desktop);
await desktop.screenshot({
  path: path.join(outDir, "adaptive-reference-track-expanded-after.png"),
  fullPage: false
});

await desktop.locator("#reference-track").setInputFiles(referencePath);
await desktop.getByText("✓ Reference Loaded").waitFor();
await desktop.getByText("test-reference.wav").waitFor();
await desktop.screenshot({
  path: path.join(outDir, "adaptive-reference-track-selected-after.png"),
  fullPage: false
});

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(baseUrl, { waitUntil: "networkidle" });
await mobile.locator('input[type="file"]').first().setInputFiles(mixPath);
await waitForAnalysis(mobile);
await openAdaptiveSection(mobile);
await ensureAdvancedControlsOpen(mobile);
await mobile.screenshot({
  path: path.join(outDir, "adaptive-reference-track-mobile-after.png"),
  fullPage: false
});

await browser.close();
console.log("adaptive reference track screenshots captured");
