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

/** Mirror of lib/openai/adaptive-mastering.ts supportsReasoningEffort — keep in sync. */
function supportsReasoningEffort(model) {
  const id = model.trim().toLowerCase();
  if (/^o\d+/.test(id)) {
    return true;
  }
  if (/^gpt-5/.test(id)) {
    return true;
  }
  return false;
}

/** Mirror of resolveAdaptiveReasoningEffort — keep in sync. */
function resolveAdaptiveReasoningEffort(model, configuredEffort) {
  if (!supportsReasoningEffort(model)) {
    return undefined;
  }
  return configuredEffort?.trim() || "low";
}

function buildAdaptiveOpenAiReasoningSpread(model, configuredEffort) {
  const effort = resolveAdaptiveReasoningEffort(model, configuredEffort);
  return effort ? { reasoning: { effort } } : {};
}

function runSupportsReasoningEffortTests() {
  assert.equal(supportsReasoningEffort("gpt-4o-mini"), false, "gpt-4o-mini is not reasoning-capable");
  assert.equal(supportsReasoningEffort("gpt-4o"), false, "gpt-4o is not reasoning-capable");
  assert.equal(supportsReasoningEffort("gpt-4.1-mini"), false, "gpt-4.1-mini is not reasoning-capable");
  assert.equal(supportsReasoningEffort("gpt-4.1"), false, "gpt-4.1 is not reasoning-capable");
  assert.equal(supportsReasoningEffort("o4-mini"), true, "o4-mini is reasoning-capable");
  assert.equal(supportsReasoningEffort("o3"), true, "o3 is reasoning-capable");
  assert.equal(supportsReasoningEffort("gpt-5-mini"), true, "gpt-5-mini is reasoning-capable");
}

function runRequestBodyReasoningTests() {
  const nonReasoningModels = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"];
  for (const model of nonReasoningModels) {
    const spread = buildAdaptiveOpenAiReasoningSpread(model, "low");
    assert.equal(
      Object.hasOwn(spread, "reasoning"),
      false,
      `${model} must not include reasoning.effort even when env is low`
    );
  }

  for (const model of ["o4-mini", "o3"]) {
    const spread = buildAdaptiveOpenAiReasoningSpread(model, "low");
    assert.deepEqual(spread, { reasoning: { effort: "low" } }, `${model} includes reasoning.effort`);
  }

  assert.deepEqual(
    buildAdaptiveOpenAiReasoningSpread("o3", undefined),
    { reasoning: { effort: "low" } },
    "reasoning-capable model defaults effort to low"
  );
}

function runSourceInvariantTests() {
  const source = read("lib/openai/adaptive-mastering.ts");
  assertIncludes(source, "export function supportsReasoningEffort", "adaptive-mastering exports supportsReasoningEffort");
  assertIncludes(source, "resolveAdaptiveReasoningEffort", "adaptive-mastering gates reasoning via resolveAdaptiveReasoningEffort");
  assertIncludes(source, "...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {})", "request body spreads reasoning conditionally");
}

runSupportsReasoningEffortTests();
runRequestBodyReasoningTests();
runSourceInvariantTests();
console.log("adaptive-openai-reasoning-effort-test: ok");
