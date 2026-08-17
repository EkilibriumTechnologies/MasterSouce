import type {
  CompilerStrategyId,
  InstructionScope,
  InstructionSource,
  PromptBudgets,
  SongDNAGenreFamily,
  SonicDNA
} from "@/lib/song-architect/types";

export const GLOBAL_INSTRUCTION_PRIORITY = [
  "genre",
  "tempo",
  "vocal",
  "instrumentation",
  "production",
  "harmony",
  "arrangement",
  "texture",
  "exclusions"
] as const;

export const SECTION_INSTRUCTION_PRIORITY = [
  "role",
  "energy",
  "instrumentation",
  "vocal",
  "transition",
  "detail"
] as const;

export type InstructionBucket = (typeof GLOBAL_INSTRUCTION_PRIORITY)[number] | (typeof SECTION_INSTRUCTION_PRIORITY)[number];

export type WeightedInstruction = {
  text: string;
  weight: number;
  bucket: InstructionBucket;
  source?: InstructionSource;
  scope?: InstructionScope;
};

export const SOURCE_AUTHORITY: Record<InstructionSource, number> = {
  explicit_user: 100,
  sonic_control: 90,
  composition: 80,
  reference_strong: 70,
  harmony: 58,
  arrangement: 54,
  inferred: 46,
  reference_likely: 34,
  reference_optional: 16
};

export const PROMPT_BUDGETS: Record<CompilerStrategyId, PromptBudgets> = {
  default: {
    stylePromptChars: 380,
    stylePromptInstructions: 8,
    perSectionBlueprintChars: 130,
    perSectionBlueprintInstructions: 3,
    totalBlueprintChars: 800,
    exclusionsCount: 2,
    pronunciationAnnotations: 6,
    exportPackageChars: 9000
  },
  concise: {
    stylePromptChars: 260,
    stylePromptInstructions: 6,
    perSectionBlueprintChars: 90,
    perSectionBlueprintInstructions: 2,
    totalBlueprintChars: 520,
    exclusionsCount: 1,
    pronunciationAnnotations: 4,
    exportPackageChars: 7000
  },
  extended: {
    stylePromptChars: 520,
    stylePromptInstructions: 10,
    perSectionBlueprintChars: 180,
    perSectionBlueprintInstructions: 4,
    totalBlueprintChars: 1100,
    exclusionsCount: 2,
    pronunciationAnnotations: 10,
    exportPackageChars: 11000
  },
  legacy: {
    stylePromptChars: 2000,
    stylePromptInstructions: 10,
    perSectionBlueprintChars: 800,
    perSectionBlueprintInstructions: 5,
    totalBlueprintChars: 4000,
    exclusionsCount: 2,
    pronunciationAnnotations: 12,
    exportPackageChars: 14000
  }
};

export const LOW_VALUE_PHRASE =
  /^(powerful|huge|emotional|epic|wide|strong|dynamic|dark|cinematic|atmospheric|ambiance|ambience)$/i;

export const LOW_VALUE_TOKENS = new Set([
  "powerful",
  "huge",
  "emotional",
  "epic",
  "wide",
  "wider",
  "strong",
  "dynamic",
  "dark",
  "cinematic",
  "atmospheric",
  "atmosphere",
  "ambience",
  "ambiance"
]);

const STOP_TOKENS = new Set(["the", "and", "with", "into", "from", "for", "of", "to", "in", "on", "a", "an", "or"]);

const SEMANTIC_CLUSTERS: string[][] = [
  ["dark", "cinematic", "atmospheric", "atmosphere", "ambience", "ambiance", "noir"],
  ["wide", "wider", "stereo", "spacious", "panoramic"],
  ["powerful", "huge", "epic", "massive", "strong"],
  ["emotional", "emotive"],
  ["dynamic", "dynamics"]
];

const GLOBAL_CONTRADICTIONS: Array<{ a: RegExp; b: RegExp }> = [
  {
    a: /\bsparse acoustic\b|\bacoustic guitar\b|\borganic room\b|\bunplugged\b|\bcampfire\b|\bperformance-first\b/,
    b: /\bfestival(?:-ready)?\b|\bedm drop\b|\bfour-on-the-floor\b|\bsidechain(?:ed)?\b|\briser into drop\b|\bsynth-led payoff\b/
  },
  {
    a: /\bintimate\b|\bwhisper\b|\bbreathy\b|\bclose(?:-mic)?\b|\bdry verses\b/,
    b: /\bconstant (?:aggressive )?scream|\bscreaming throughout\b|\balways aggressive\b|\baggressive screaming\b/
  },
  {
    a: /\bminimal percussion\b|\bno drums\b|\bbrushes only\b|\bundrummed\b|\bsparse.*percussion\b/,
    b: /\bdense percussion wall\b|\bdrum wall\b|\bfull percussion assault\b|\bpercussion wall\b/
  }
];

const PROTECTED_SOURCES = new Set<InstructionSource>(["explicit_user", "sonic_control", "composition"]);

export type InstructionSelectionStats = {
  selected: string[];
  candidateInstructionCount: number;
  selectedInstructionCount: number;
  droppedForRedundancy: number;
  droppedForBudget: number;
  conflictsResolved: number;
  sourceBreakdown: Record<string, number>;
};

export function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_TOKENS.has(token));
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

export function jaccard(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  let inter = 0;
  for (const token of left) {
    if (right.has(token)) inter += 1;
  }
  const union = left.size + right.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function clusterOverlap(a: string[], b: string[]): boolean {
  return SEMANTIC_CLUSTERS.some((cluster) => {
    const hasA = cluster.some((token) => a.includes(token));
    const hasB = cluster.some((token) => b.includes(token));
    return hasA && hasB;
  });
}

export function informationScore(text: string): number {
  const tokens = tokensOf(text);
  if (tokens.length === 0) return 0;
  const low = tokens.filter((token) => LOW_VALUE_TOKENS.has(token)).length;
  return tokens.length - low * 0.85;
}

export function isLowValue(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (LOW_VALUE_PHRASE.test(trimmed)) return true;
  const tokens = tokensOf(trimmed);
  return tokens.length > 0 && tokens.every((token) => LOW_VALUE_TOKENS.has(token));
}

export function rankInstruction(item: WeightedInstruction): number {
  const sourceBoost = SOURCE_AUTHORITY[item.source ?? "inferred"];
  return item.weight + sourceBoost;
}

export function isProtectedSource(source: InstructionSource | undefined): boolean {
  return Boolean(source && PROTECTED_SOURCES.has(source));
}

export function dedupeInstructions(instructions: string[]): string[] {
  const kept: string[] = [];
  for (const raw of instructions) {
    const text = raw.trim();
    if (!text || isLowValue(text)) continue;
    const currentTokens = tokensOf(text);
    const overlapIndex = kept.findIndex((existing) => {
      const existingTokens = tokensOf(existing);
      const similar = jaccard(currentTokens, existingTokens) >= 0.55;
      const clustered = clusterOverlap(currentTokens, existingTokens) && jaccard(currentTokens, existingTokens) >= 0.28;
      return similar || clustered;
    });
    if (overlapIndex === -1) {
      kept.push(text);
      continue;
    }
    const existing = kept[overlapIndex];
    if (informationScore(text) > informationScore(existing)) {
      kept[overlapIndex] = text;
    }
  }
  return kept;
}

function familyBlob(family: SongDNAGenreFamily, sonic: SonicDNA): string {
  return [family, sonic.primaryGenre, ...(sonic.subgenres ?? []), sonic.productionAesthetic, sonic.groove]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function preferByAuthority(left: string, right: string, authority: string): string {
  const leftHit = tokensOf(left).some((token) => authority.includes(token));
  const rightHit = tokensOf(right).some((token) => authority.includes(token));
  if (leftHit !== rightHit) return leftHit ? left : right;
  return informationScore(left) >= informationScore(right) ? left : right;
}

export function resolvePromptConflictsDetailed(
  instructions: string[],
  args?: { family?: SongDNAGenreFamily; sonic?: SonicDNA }
): { resolved: string[]; conflictsResolved: number } {
  const authority = familyBlob(args?.family ?? "generic", args?.sonic ?? {});
  let next = [...instructions];
  let conflictsResolved = 0;

  for (const pair of GLOBAL_CONTRADICTIONS) {
    const matchesA = next.filter((item) => pair.a.test(item));
    const matchesB = next.filter((item) => pair.b.test(item));
    if (matchesA.length === 0 || matchesB.length === 0) continue;
    const keepA = preferByAuthority(matchesA[0], matchesB[0], authority) === matchesA[0];
    const before = next.length;
    next = next.filter((item) => (keepA ? !pair.b.test(item) : !pair.a.test(item)));
    if (next.length < before) conflictsResolved += 1;
  }

  return { resolved: next, conflictsResolved };
}

export function resolvePromptConflicts(
  instructions: string[],
  args?: { family?: SongDNAGenreFamily; sonic?: SonicDNA }
): string[] {
  return resolvePromptConflictsDetailed(instructions, args).resolved;
}

export function isGlobalRestatement(localText: string, globalTexts: string[]): boolean {
  const localTokens = tokensOf(localText);
  if (localTokens.length === 0) return true;
  const globalTokenSet = new Set(globalTexts.flatMap((text) => tokensOf(text)));
  const unique = localTokens.filter((token) => !globalTokenSet.has(token) && !LOW_VALUE_TOKENS.has(token));
  if (unique.length === 0) return true;
  const meaningful = localTokens.filter((token) => !LOW_VALUE_TOKENS.has(token));
  if (meaningful.length > 0 && unique.length / meaningful.length <= 0.3) return true;
  return globalTexts.some((global) => jaccard(localTokens, tokensOf(global)) >= 0.62);
}

export function filterLocalDeltas(
  candidates: WeightedInstruction[],
  globalTexts: string[]
): { kept: WeightedInstruction[]; droppedForRedundancy: number } {
  const kept: WeightedInstruction[] = [];
  let droppedForRedundancy = 0;
  for (const candidate of candidates) {
    if (isGlobalRestatement(candidate.text, globalTexts)) {
      droppedForRedundancy += 1;
      continue;
    }
    kept.push(candidate);
  }
  return { kept, droppedForRedundancy };
}

export function compressInstruction(text: string): string {
  const parts = text
    .split(/,\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !isLowValue(part));
  return parts.join(", ") || text.trim();
}

function sourceBreakdownOf(items: WeightedInstruction[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const item of items) {
    const key = item.source ?? "inferred";
    breakdown[key] = (breakdown[key] ?? 0) + 1;
  }
  return breakdown;
}

function joinedLength(parts: string[]): number {
  return parts.join(", ").length;
}

export function selectBudgetedInstructions(
  candidates: WeightedInstruction[],
  options?: {
    maxInstructions?: number;
    maxChars?: number;
    family?: SongDNAGenreFamily;
    sonic?: SonicDNA;
  }
): InstructionSelectionStats {
  const usable = candidates.filter((candidate) => candidate.text.trim() && !isLowValue(candidate.text));
  const ranked = [...usable].sort(
    (left, right) => rankInstruction(right) - rankInstruction(left) || informationScore(right.text) - informationScore(left.text)
  );

  const beforeDedupe = ranked.length;
  const dedupedTexts = dedupeInstructions(ranked.map((candidate) => candidate.text.trim()));
  const droppedForRedundancy = Math.max(0, beforeDedupe - dedupedTexts.length);

  const chosen = dedupedTexts
    .map((text) => ranked.find((candidate) => candidate.text.trim() === text))
    .filter((item): item is WeightedInstruction => Boolean(item));

  const conflict = resolvePromptConflictsDetailed(
    chosen.map((item) => item.text),
    { family: options?.family, sonic: options?.sonic }
  );
  const conflictSet = new Set(conflict.resolved);
  let selectedItems = chosen.filter((item) => conflictSet.has(item.text));

  const maxInstructions = options?.maxInstructions ?? 12;
  const maxChars = options?.maxChars;
  let droppedForBudget = 0;

  if (selectedItems.length > maxInstructions) {
    const protectedItems = selectedItems.filter((item) => isProtectedSource(item.source));
    const flexible = selectedItems.filter((item) => !isProtectedSource(item.source));
    const keepFlexible = Math.max(0, maxInstructions - protectedItems.length);
    const dropped = flexible
      .sort((left, right) => rankInstruction(left) - rankInstruction(right))
      .slice(0, Math.max(0, flexible.length - keepFlexible));
    const dropSet = new Set(dropped);
    droppedForBudget += dropped.length;
    selectedItems = selectedItems.filter((item) => !dropSet.has(item)).slice(0, maxInstructions);
  }

  if (typeof maxChars === "number") {
    while (selectedItems.length > 1 && joinedLength(selectedItems.map((item) => item.text)) > maxChars) {
      const dropIndex = [...selectedItems]
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !isProtectedSource(item.source) || selectedItems.every((entry) => isProtectedSource(entry.source)))
        .sort((left, right) => rankInstruction(left.item) - rankInstruction(right.item))[0]?.index;
      if (dropIndex === undefined) break;
      selectedItems.splice(dropIndex, 1);
      droppedForBudget += 1;
    }

    if (selectedItems.length === 1 && joinedLength(selectedItems.map((item) => item.text)) > maxChars) {
      const compressed = compressInstruction(selectedItems[0].text);
      if (compressed !== selectedItems[0].text && compressed.length < selectedItems[0].text.length) {
        selectedItems = [{ ...selectedItems[0], text: compressed }];
        droppedForBudget += 1;
      }
    }
  }

  return {
    selected: selectedItems.map((item) => item.text),
    candidateInstructionCount: usable.length,
    selectedInstructionCount: selectedItems.length,
    droppedForRedundancy,
    droppedForBudget,
    conflictsResolved: conflict.conflictsResolved,
    sourceBreakdown: sourceBreakdownOf(selectedItems)
  };
}

export function selectPriorityInstructions(
  candidates: WeightedInstruction[],
  options?: { max?: number; family?: SongDNAGenreFamily; sonic?: SonicDNA }
): string[] {
  return selectBudgetedInstructions(candidates, {
    maxInstructions: options?.max ?? 12,
    family: options?.family,
    sonic: options?.sonic
  }).selected;
}

export function mergeSelectionStats(parts: InstructionSelectionStats[]): InstructionSelectionStats {
  const sourceBreakdown: Record<string, number> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part.sourceBreakdown)) {
      sourceBreakdown[key] = (sourceBreakdown[key] ?? 0) + value;
    }
  }
  return {
    selected: parts.flatMap((part) => part.selected),
    candidateInstructionCount: parts.reduce((sum, part) => sum + part.candidateInstructionCount, 0),
    selectedInstructionCount: parts.reduce((sum, part) => sum + part.selectedInstructionCount, 0),
    droppedForRedundancy: parts.reduce((sum, part) => sum + part.droppedForRedundancy, 0),
    droppedForBudget: parts.reduce((sum, part) => sum + part.droppedForBudget, 0),
    conflictsResolved: parts.reduce((sum, part) => sum + part.conflictsResolved, 0),
    sourceBreakdown
  };
}

export function applyTotalBlueprintBudget(
  sections: Array<{ label: string; instructions: string[] }>,
  maxChars: number
): { sections: Array<{ label: string; instructions: string[] }>; droppedForBudget: number } {
  const clone = sections.map((section) => ({ ...section, instructions: [...section.instructions] }));
  let droppedForBudget = 0;
  const total = () => clone.reduce((sum, section) => sum + `[${section.label}]\n${section.instructions.join(", ")}`.length + 2, 0);

  while (clone.some((section) => section.instructions.length > 1) && total() > maxChars) {
    const candidate = [...clone]
      .map((section, index) => ({ section, index, extra: section.instructions.length }))
      .filter((entry) => entry.extra > 1)
      .sort((left, right) => right.extra - left.extra || right.index - left.index)[0];
    if (!candidate) break;
    candidate.section.instructions.pop();
    droppedForBudget += 1;
  }

  return { sections: clone, droppedForBudget };
}
