/**
 * Builds MasterSauce favicons from the icon portion of public/mastersauce-logo.png
 * (wordmark excluded). Maximizes icon size in each square with trim + margin fit.
 * Run: npm run favicon
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "public", "mastersauce-logo.png");
const publicDir = path.join(root, "public");

// Rough crop: icon only, excludes wordmark; trim() below removes remaining transparent padding.
const ICON_EXTRACT = { left: 67, top: 0, width: 331, height: 190 };

/** ~5.5% inset each side so rounded caps are not clipped by tab/UI chrome */
const SAFE_MARGIN = 0.055;

/**
 * @param {Buffer} trimmedPng - RGBA, already trimmed
 * @param {number} W
 * @param {number} H
 * @param {number} S - output square size
 * @param {{ supersample?: boolean }} opts
 */
async function renderToSquare(trimmedPng, W, H, S, opts = {}) {
  const { supersample = false } = opts;
  const maxSide = S * (1 - 2 * SAFE_MARGIN);
  const scale = maxSide / Math.max(W, H);
  let outW = Math.max(1, Math.round(W * scale));
  let outH = Math.max(1, Math.round(H * scale));
  outW = Math.min(outW, Math.floor(maxSide));
  outH = Math.min(outH, Math.floor(maxSide));

  let resized;
  if (supersample && S <= 48) {
    const k = S <= 16 ? 8 : S <= 32 ? 4 : 2;
    const bigW = Math.max(1, outW * k);
    const bigH = Math.max(1, outH * k);
    resized = await sharp(trimmedPng)
      .resize(bigW, bigH, { kernel: sharp.kernel.lanczos3, fit: "fill" })
      .resize(outW, outH, { kernel: sharp.kernel.cubic })
      .png()
      .toBuffer();
  } else {
    let pipeline = sharp(trimmedPng).resize(outW, outH, { kernel: sharp.kernel.lanczos3, fit: "fill" });
    if (S <= 64) {
      pipeline = pipeline.sharpen({ sigma: 0.4, m1: 0.55, m2: 2.8 });
    }
    resized = await pipeline.png().toBuffer();
  }

  const left = Math.floor((S - outW) / 2);
  const top = Math.floor((S - outH) / 2);

  return sharp({
    create: {
      width: S,
      height: S,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  const trimmedPng = await sharp(src)
    .extract(ICON_EXTRACT)
    .trim({ threshold: 8 })
    .png()
    .toBuffer();

  const { width: W, height: H } = await sharp(trimmedPng).metadata();
  if (!W || !H) throw new Error("Could not read trimmed icon dimensions");

  const png16 = await renderToSquare(trimmedPng, W, H, 16, { supersample: true });
  const png32 = await renderToSquare(trimmedPng, W, H, 32, { supersample: true });
  const png48 = await renderToSquare(trimmedPng, W, H, 48, { supersample: true });
  const png180 = await renderToSquare(trimmedPng, W, H, 180, { supersample: false });

  fs.writeFileSync(path.join(publicDir, "favicon-16x16.png"), png16);
  fs.writeFileSync(path.join(publicDir, "favicon-32x32.png"), png32);
  fs.writeFileSync(path.join(publicDir, "favicon-48x48.png"), png48);
  fs.writeFileSync(path.join(publicDir, "apple-touch-icon.png"), png180);

  const icoBuf = await toIco([png16, png32, png48]);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuf);

  console.log(
    `Trimmed icon ${W}x${H}px → favicons (max glyph ~${Math.round(16 * (1 - 2 * SAFE_MARGIN))}–${Math.round(180 * (1 - 2 * SAFE_MARGIN))}px usable per canvas)`
  );
  console.log("Wrote favicon-16x16.png, favicon-32x32.png, favicon-48x48.png, apple-touch-icon.png, favicon.ico");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
