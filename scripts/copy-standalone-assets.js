/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
const publicSrc = path.join(root, "public");
const publicDest = path.join(standaloneDir, "public");

if (!fs.existsSync(standaloneDir)) {
  console.warn("[copy-standalone-assets] .next/standalone not found; skipping.");
  process.exit(0);
}

function copyDirIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  fs.cpSync(src, dest, { recursive: true });
}

copyDirIfExists(staticSrc, staticDest);
copyDirIfExists(publicSrc, publicDest);
console.log("[copy-standalone-assets] synced .next/static and public into .next/standalone (if present).");
