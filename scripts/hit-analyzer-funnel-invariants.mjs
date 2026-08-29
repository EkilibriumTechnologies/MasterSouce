/** Hit Analyzer post-report conversion funnel invariants. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const ROOT = process.cwd();
const read = (relPath) => readFileSync(path.join(ROOT, relPath), "utf8");
const includes = (content, needle, context) =>
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
const excludes = (content, needle, context) =>
  assert.ok(!content.includes(needle), `${context}: must not include "${needle}"`);

const analytics = read("lib/ar-ai/analytics.ts");
const page = read("app/ar-ai/page.tsx");
const pricing = read("components/pricing-section.tsx");
const gtag = read("lib/analytics/gtag.ts");
const plans = read("lib/subscriptions/plans.ts");

for (const event of [
  "hit_analyzer_started",
  "hit_analyzer_succeeded",
  "hit_analyzer_failed",
  "hit_analyzer_quota_blocked",
  "hit_analyzer_post_report_cta_viewed",
  "hit_analyzer_master_cta_clicked",
  "hit_analyzer_subscription_cta_clicked"
]) {
  includes(analytics, `"${event}"`, `${event} is declared`);
  includes(page, `"${event}"`, `${event} is emitted`);
}

includes(page, "useState<ArAiReport | null>(null)", "post-report CTAs are hidden initially");
includes(page, "{report ? (", "post-report CTAs are gated by a valid report");
assert.ok(page.indexOf("{report ? (") < page.indexOf("Next steps after your report"), "CTA gate wraps heading");
const submittingIndex = page.indexOf("setIsSubmitting(true)");
const clearReportIndex = page.indexOf("setReport(null)", submittingIndex);
const fetchIndex = page.indexOf('fetch("/api/ar-ai"', clearReportIndex);
assert.ok(submittingIndex >= 0 && clearReportIndex > submittingIndex && fetchIndex > clearReportIndex, "CTAs hide while loading");
const failureTerminalIndex = page.indexOf('trackTerminal("hit_analyzer_failed"');
assert.ok(
  failureTerminalIndex >= 0 && page.indexOf("setError(", failureTerminalIndex) > failureTerminalIndex,
  "failure is terminal without a report"
);
const quotaTerminalIndex = page.indexOf('trackTerminal("hit_analyzer_quota_blocked"');
assert.ok(
  quotaTerminalIndex >= 0 && page.indexOf("setUpgradeRequired", quotaTerminalIndex) > quotaTerminalIndex,
  "quota block is terminal without a report"
);
assert.ok(page.indexOf("setReport(data)") < page.indexOf('trackTerminal("hit_analyzer_succeeded"'), "success requires a report");
includes(page, 'href="/?source=hit-analyzer#master"', "master CTA targets attributed mastering workspace");
includes(page, 'href="/pricing?source=hit-analyzer"', "Creator CTA preserves source attribution");
includes(page, 'currentPlanId === "free"', "Creator CTA is limited to eligible Free users");
includes(page, "setCurrentPlanId(data.planId)", "CTA eligibility uses access response even when usage is null");
includes(page, 'plan_id: "creator_monthly"', "Creator CTA uses stable plan id");
includes(page, "postReportCtaViewedRef", "CTA impression is deduplicated across rerenders");
includes(page, "terminalTracked", "each attempt deduplicates terminal events");
includes(page, "you&apos;ll need to upload the track again", "mastering CTA explains re-upload");

for (const pii of ["email", "filename", "audio_id", "lyrics", "report_text", "prompt", "stripe_id"]) {
  excludes(analytics.toLowerCase(), pii, `analytics payload excludes ${pii}`);
}
includes(analytics, "try {", "analytics is guarded");
includes(analytics, "analytics must never block Hit Analyzer behavior", "analytics failure is explicitly non-blocking");
excludes(analytics, '"purchase"', "Hit Analyzer never declares purchase");
excludes(page, "begin_checkout", "Hit Analyzer CTA does not emit begin_checkout");

includes(pricing, 'searchParams?.get("source") === "hit-analyzer"', "pricing consumes Hit Analyzer attribution");
includes(pricing, '"/?source=hit-analyzer"', "checkout return path preserves Hit Analyzer attribution");
includes(pricing, "sourceFlow: attributedSourceFlow", "begin_checkout receives Hit Analyzer source flow");
includes(gtag, "source_flow: params.sourceFlow", "begin_checkout supports low-cardinality source attribution");
includes(plans, "monthlyPriceUsd: 9", "Creator price remains unchanged");
includes(plans, "monthlyPriceUsd: 24", "Pro Studio price remains unchanged");

console.log("Hit Analyzer funnel invariants passed");
