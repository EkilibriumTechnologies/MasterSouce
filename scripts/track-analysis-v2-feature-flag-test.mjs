/**
 * TrackAnalysisV2 feature-flag tests.
 *
 * Proves the flag contract WITHOUT running any real FFmpeg subprocesses:
 * - Flag defaults to disabled (fail-safe env parsing).
 * - Disabled flag causes NO V2 execution and omits `analysisV2`.
 * - Enabled flag runs V2 and returns additive `analysisV2`.
 * - V2 failure never breaks the required existing analysis.
 * - No client bundle imports/exposes the server-only feature flag.
 * - No mastering pipeline consumes V2.
 * - Existing analyze response is unchanged when the flag is disabled.
 *
 * Run: node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs \
 *        scripts/track-analysis-v2-feature-flag-test.mjs
 *
 * No OpenAI, Stripe, Supabase, network, DSP, or production credentials required.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TRACK_ANALYSIS_V2_ENV_VAR,
  resolveTrackAnalysisV2Mode,
  isTrackAnalysisV2Enabled,
  resolveTrackAnalysisV2Enablement
} from "@/lib/features/track-analysis-v2";
import { analyzeTrackWithV2 } from "@/lib/audio/analyze-track-combined";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relPath) => readFileSync(path.join(REPO_ROOT, relPath), "utf8");

const stubAnalysis = Object.freeze({
  durationSec: 180,
  integratedLufs: -12,
  peakDb: -1,
  meanDb: -18,
  crestDb: 17,
  lowEndDb: -20,
  lowMidDb: -24,
  harshnessDb: -26,
  airDb: -30,
  alreadyLimited: false,
  notes: []
});

const v2Summary = Object.freeze({ schemaVersion: 2, activeFlags: ["low_end_excess"] });

async function run() {
  // 1) Flag defaults to disabled with explicit, safe parsing.
  assert.equal(resolveTrackAnalysisV2Mode({}), "off", "missing env -> off");
  assert.equal(isTrackAnalysisV2Enabled({}), false, "flag defaults to disabled");
  const offCases = { [TRACK_ANALYSIS_V2_ENV_VAR]: "" };
  assert.equal(isTrackAnalysisV2Enabled(offCases), false, "empty string -> off");
  for (const val of ["false", "0", "no", "off", "nope", "2", "  ", "enable"]) {
    assert.equal(
      isTrackAnalysisV2Enabled({ [TRACK_ANALYSIS_V2_ENV_VAR]: val }),
      false,
      `unrecognized/false-y "${val}" -> disabled`
    );
  }
  for (const val of ["true", "TRUE", " True ", "1", "yes", "on", "ON"]) {
    assert.equal(
      isTrackAnalysisV2Enabled({ [TRACK_ANALYSIS_V2_ENV_VAR]: val }),
      true,
      `"${val}" -> enabled`
    );
    assert.equal(resolveTrackAnalysisV2Mode({ [TRACK_ANALYSIS_V2_ENV_VAR]: val }), "on");
  }
  console.log("test flag default + parsing: ok");

  // 2) Owner mode gates on the injected bypass thunk (evaluated lazily, only in
  //    owner mode) and never invents its own auth.
  {
    assert.equal(resolveTrackAnalysisV2Mode({ [TRACK_ANALYSIS_V2_ENV_VAR]: "owner" }), "owner");
    assert.equal(resolveTrackAnalysisV2Mode({ [TRACK_ANALYSIS_V2_ENV_VAR]: "admin" }), "owner");
    // Global check stays false for owner mode (it is request-scoped).
    assert.equal(isTrackAnalysisV2Enabled({ [TRACK_ANALYSIS_V2_ENV_VAR]: "owner" }), false);

    const ownerEnv = { [TRACK_ANALYSIS_V2_ENV_VAR]: "owner" };
    assert.equal(
      resolveTrackAnalysisV2Enablement(() => true, ownerEnv),
      true,
      "owner mode + bypass granted -> enabled"
    );
    assert.equal(
      resolveTrackAnalysisV2Enablement(() => false, ownerEnv),
      false,
      "owner mode + bypass denied -> disabled"
    );

    // Thunk must NOT be evaluated on the on/off paths (no wasted auth work).
    let onCalls = 0;
    assert.equal(
      resolveTrackAnalysisV2Enablement(
        () => {
          onCalls += 1;
          return true;
        },
        { [TRACK_ANALYSIS_V2_ENV_VAR]: "true" }
      ),
      true,
      "on mode enabled for any request"
    );
    assert.equal(onCalls, 0, "bypass thunk not evaluated in on mode");

    let offCalls = 0;
    assert.equal(
      resolveTrackAnalysisV2Enablement(() => {
        offCalls += 1;
        return true;
      }, {}),
      false,
      "off mode never enables even if bypass would grant"
    );
    assert.equal(offCalls, 0, "bypass thunk not evaluated in off/default mode");
    console.log("test owner-mode bypass injection: ok");
  }

  // 3) Disabled flag => NO V2 execution, analysisV2 omitted, response unchanged.
  {
    let v2Called = 0;
    const combined = await analyzeTrackWithV2("/fake/path.wav", {
      enableV2: false,
      analyzeExisting: async () => stubAnalysis,
      analyzeV2Summary: async () => {
        v2Called += 1;
        return v2Summary;
      }
    });
    assert.equal(v2Called, 0, "V2 analyzer never invoked when disabled");
    assert.equal(combined.analysisV2, undefined, "analysisV2 omitted when disabled");
    assert.deepEqual(Object.keys(combined), ["analysis"], "only { analysis } returned when disabled");
    assert.equal(combined.analysis, stubAnalysis, "existing analysis passed through unchanged");
    console.log("test disabled -> no V2 execution: ok");
  }

  // 4) Enabled flag => V2 runs and analysisV2 is additively present.
  {
    let v2Called = 0;
    const combined = await analyzeTrackWithV2("/fake/path.wav", {
      enableV2: true,
      analyzeExisting: async () => stubAnalysis,
      analyzeV2Summary: async () => {
        v2Called += 1;
        return v2Summary;
      }
    });
    assert.equal(v2Called, 1, "V2 analyzer invoked exactly once when enabled");
    assert.equal(combined.analysis, stubAnalysis, "existing analysis remains required + unchanged");
    assert.ok(combined.analysisV2 && combined.analysisV2.schemaVersion === 2, "analysisV2 additive");
    console.log("test enabled -> additive analysisV2: ok");
  }

  // 5) Default (enableV2 omitted) is FAIL-SAFE: V2 does NOT run. No caller can
  //    activate the expensive, experimental V2 path by forgetting the option.
  {
    let v2Called = 0;
    const combined = await analyzeTrackWithV2("/fake/path.wav", {
      analyzeExisting: async () => stubAnalysis,
      analyzeV2Summary: async () => {
        v2Called += 1;
        return v2Summary;
      }
    });
    assert.equal(v2Called, 0, "enableV2 defaults to false (no accidental activation)");
    assert.equal(combined.analysisV2, undefined, "analysisV2 omitted when option omitted");
    assert.deepEqual(Object.keys(combined), ["analysis"], "only { analysis } returned by default");
    assert.equal(combined.analysis, stubAnalysis, "existing analysis passed through unchanged");
    console.log("test default option fail-safe (no V2): ok");
  }

  // 6) V2 failure never breaks the required existing analysis.
  {
    const combined = await analyzeTrackWithV2("/fake/path.wav", {
      enableV2: true,
      analyzeExisting: async () => stubAnalysis,
      analyzeV2Summary: async () => {
        throw new Error("simulated V2 failure");
      }
    });
    assert.equal(combined.analysis, stubAnalysis, "existing analysis survives V2 failure");
    assert.equal(combined.analysisV2, undefined, "analysisV2 omitted on V2 failure (fail-open)");
    console.log("test V2 failure never breaks existing: ok");
  }

  // 7) No client bundle imports/exposes the server-only feature flag, and the
  //    flag module never uses a client-exposed (NEXT_PUBLIC_) variable.
  {
    const flagSrc = read("lib/features/track-analysis-v2.ts");
    // Detect real usage (env access / quoted keys), not doc-comment prose.
    const nextPublicUsage =
      /process\.env\.\s*NEXT_PUBLIC/.test(flagSrc) ||
      /env\s*\[\s*["']NEXT_PUBLIC/.test(flagSrc) ||
      /["']NEXT_PUBLIC_[A-Z0-9_]*["']/.test(flagSrc);
    assert.ok(!nextPublicUsage, "feature flag must not read/expose a NEXT_PUBLIC_ variable");
    assert.ok(
      flagSrc.includes('"TRACK_ANALYSIS_V2_ENABLED"'),
      "feature flag reads the server-only TRACK_ANALYSIS_V2_ENABLED variable"
    );

    const flagModuleSpecifiers = [
      "@/lib/features/track-analysis-v2",
      "lib/features/track-analysis-v2"
    ];
    const scanDirs = ["app", "components", "src"];
    const offenders = [];
    const walk = (dir) => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(full);
          continue;
        }
        if (!/\.(tsx?|jsx?|mjs)$/.test(entry.name)) continue;
        const src = readFileSync(full, "utf8");
        const isClient = /^\s*["']use client["']/m.test(src);
        if (!isClient) continue;
        for (const mod of flagModuleSpecifiers) {
          const importRe = new RegExp(`["']${mod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
          if (importRe.test(src)) offenders.push(`${full} -> ${mod}`);
        }
      }
    };
    for (const d of scanDirs) walk(path.join(REPO_ROOT, d));
    assert.equal(
      offenders.length,
      0,
      `client bundles must not import the server feature flag:\n${offenders.join("\n")}`
    );
    console.log("test no-client-exposure-of-flag: ok");
  }

  // 8) No mastering pipeline consumes V2 (DSP path is untouched).
  {
    const pipelineFiles = [
      "lib/audio/mastering-pipeline.ts",
      "lib/audio/adaptive-mastering-pipeline.ts"
    ];
    for (const rel of pipelineFiles) {
      const src = read(rel);
      assert.ok(!/track-analysis-v2/.test(src), `${rel} must not import TrackAnalysisV2`);
      assert.ok(!/analyze-track-combined/.test(src), `${rel} must not import the V2 orchestrator`);
      assert.ok(!/analyzeTrackWithV2|analyzeTrackV2/.test(src), `${rel} must not call V2 analyzers`);
    }
    // Mastering + AR-AI routes still use the plain existing analyzer, not V2.
    for (const rel of ["app/api/master-ai/route.ts", "app/api/ar-ai/route.ts"]) {
      const src = read(rel);
      assert.ok(!/analyzeTrackWithV2/.test(src), `${rel} must not orchestrate V2`);
    }
    console.log("test no-mastering-pipeline-consumes-V2: ok");
  }

  // 9) Route wiring: flag gates V2 and disabled response stays unchanged.
  {
    const routeSrc = read("app/api/analyze-track/route.ts");
    assert.ok(
      routeSrc.includes("resolveTrackAnalysisV2Enablement("),
      "route resolves V2 enablement from the server feature flag per request"
    );
    assert.ok(
      routeSrc.includes("isMasterAdminBypassGranted(request)"),
      "route reuses the existing owner bypass helper for owner-mode gating"
    );
    assert.ok(
      routeSrc.includes("enableV2: trackAnalysisV2Enabled"),
      "route forwards the flag to the V2 orchestrator"
    );
    // analysisV2 is only ever spread additively when present, so the disabled
    // response body is byte-for-byte the existing shape (analysis + source).
    assert.ok(
      /\.\.\.\(analysisV2 \? \{ analysisV2 \} : \{\}\)/.test(routeSrc),
      "analysisV2 is spread conditionally (never present when disabled)"
    );
    assert.ok(
      routeSrc.includes("analyzeTrackWithV2(uploadRecord.filePath"),
      "route still analyzes the upload via the combined orchestrator"
    );
    console.log("test route wiring + disabled response unchanged: ok");
  }

  console.log("\ntrack-analysis-v2-feature-flag-test: ok");
}

run().catch((err) => {
  console.error("track-analysis-v2-feature-flag-test FAILED:", err);
  process.exitCode = 1;
});
