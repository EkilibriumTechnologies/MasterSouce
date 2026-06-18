import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "promo-preview.html");
const outDir = path.join(__dirname, "..", "promo-screenshots");

async function capture(selector, filename, page) {
  const el = page.locator(selector);
  await el.screenshot({ path: path.join(outDir, filename) });
  console.log(`saved ${filename}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`);

await capture("#banner-preview", "promo-banner.png", page);
await capture("#pricing-preview", "pricing-page.png", page);
await capture("#popup-preview", "promo-popup.png", page);

await browser.close();
console.log("promo screenshots captured");
