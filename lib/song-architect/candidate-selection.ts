import { scoreCritique } from "@/lib/song-architect/critic";
import type { SongArchitectCandidate, SongCandidateCritique } from "@/lib/song-architect/types";

/**
 * Explicit selection weights. Hard constraints dominate; scores are ranking signals only.
 *
 * 1. hard constraint compliance  40
 * 2. Song DNA adherence          18
 * 3. hook quality                16
 * 4. singability / flow          10
 * 5. emotional payoff             8
 * 6. structural coherence         5
 * 7. originality / cliché         3
 *
 * Severe AI-writing-pattern risk (>= 50) subtracts 10 ranking points
 * so a cliché-heavy draft loses when other quality is comparable.
 */
export const CRITIC_SELECTION_WEIGHTS = {
  hardConstraintCompliance: 40,
  songDNAAdherence: 18,
  hookQuality: 16,
  singability: 10,
  emotionalPayoff: 8,
  structuralCoherence: 5,
  originality: 3
} as const;

export const TIE_SCORE_DELTA = 3;

export type RepairTargetKind =
  | "avoid_words"
  | "must_include"
  | "missing_section"
  | "language"
  | "hook"
  | "structure"
  | "singability"
  | "section"
  | "sonic_exclusion_leak";

export type RepairTarget = {
  kind: RepairTargetKind;
  section?: string;
  detail: string;
};

export type CandidateSelectionResult = {
  winnerId: string;
  loserId?: string;
  winnerScore: number;
  loserScore?: number;
  scoreDelta: number;
  tied: boolean;
  whyThisVersion: string[];
  usedTieBreak: boolean;
};

export function selectionScore(critique: SongCandidateCritique): number {
  return scoreCritique(critique.dimensions, critique.hardConstraintViolations.length);
}

function hookClarity(critique: SongCandidateCritique): number {
  return critique.dimensions.hookClarity ?? critique.dimensions.hookStrength ?? 0;
}

function singability(critique: SongCandidateCritique): number {
  return critique.dimensions.singability ?? 0;
}

function aiRisk(critique: SongCandidateCritique): number {
  return critique.dimensions.aiWritingRisk ?? 0;
}

function compareTieBreak(left: SongCandidateCritique, right: SongCandidateCritique): number {
  const hard = left.hardConstraintViolations.length - right.hardConstraintViolations.length;
  if (hard !== 0) return hard;
  const hook = hookClarity(right) - hookClarity(left);
  if (hook !== 0) return hook;
  const flow = singability(right) - singability(left);
  if (flow !== 0) return flow;
  const risk = aiRisk(left) - aiRisk(right);
  if (risk !== 0) return risk;
  return left.candidateId.localeCompare(right.candidateId);
}

function whyForWinner(winner: SongCandidateCritique, loser?: SongCandidateCritique): string[] {
  if (!loser) return winner.strengths.slice(0, 3);
  const reasons: string[] = [];
  if (winner.hardConstraintViolations.length < loser.hardConstraintViolations.length) {
    reasons.push("cleaner hard-constraint compliance");
  }
  if ((winner.dimensions.hookStrength ?? 0) > (loser.dimensions.hookStrength ?? 0) + 2) {
    reasons.push("stronger hook");
  }
  if ((winner.dimensions.hookClarity ?? 0) > (loser.dimensions.hookClarity ?? 0) + 2) {
    reasons.push("clearer hook");
  }
  if ((winner.dimensions.singability ?? 0) > (loser.dimensions.singability ?? 0) + 2) {
    reasons.push("cleaner flow");
  }
  if ((winner.dimensions.structuralCoherence ?? 0) > (loser.dimensions.structuralCoherence ?? 0) + 2) {
    reasons.push("better section contrast");
  }
  if ((winner.dimensions.aiWritingRisk ?? 100) + 4 < (loser.dimensions.aiWritingRisk ?? 100)) {
    reasons.push("lower AI-writing-pattern risk");
  }
  if (reasons.length === 0) {
    reasons.push(...winner.strengths.slice(0, 2));
  }
  return reasons.slice(0, 4);
}

export function selectBestCandidate(critiques: SongCandidateCritique[]): CandidateSelectionResult {
  if (critiques.length === 0) {
    throw new Error("selectBestCandidate requires at least one critique.");
  }
  if (critiques.length === 1) {
    const only = critiques[0];
    return {
      winnerId: only.candidateId,
      winnerScore: selectionScore(only),
      scoreDelta: 0,
      tied: false,
      whyThisVersion: [],
      usedTieBreak: false
    };
  }

  const ranked = [...critiques].sort((left, right) => {
    const scoreDiff = selectionScore(right) - selectionScore(left);
    if (Math.abs(scoreDiff) > TIE_SCORE_DELTA) return scoreDiff;
    return compareTieBreak(left, right);
  });

  const winner = ranked[0];
  const loser = ranked[1];
  const rawDelta = selectionScore(winner) - selectionScore(loser);
  const tied = Math.abs(selectionScore(critiques[0]) - selectionScore(critiques[1])) <= TIE_SCORE_DELTA;

  return {
    winnerId: winner.candidateId,
    loserId: loser.candidateId,
    winnerScore: selectionScore(winner),
    loserScore: selectionScore(loser),
    scoreDelta: Math.abs(rawDelta),
    tied,
    whyThisVersion: whyForWinner(winner, loser),
    usedTieBreak: tied
  };
}

export function collectRepairTargets(critique: SongCandidateCritique): RepairTarget[] {
  const targets: RepairTarget[] = [];
  for (const violation of critique.hardConstraintViolations) {
    if (/Avoid Words/i.test(violation)) {
      targets.push({ kind: "avoid_words", detail: violation });
      continue;
    }
    if (/Must Include/i.test(violation)) {
      targets.push({ kind: "must_include", detail: violation });
      continue;
    }
    if (/Missing required section/i.test(violation)) {
      const section = violation.split(":").slice(1).join(":").trim();
      targets.push({ kind: "missing_section", section, detail: violation });
      continue;
    }
    if (/Language mismatch/i.test(violation)) {
      targets.push({ kind: "language", detail: violation });
      continue;
    }
    if (/Hook identity/i.test(violation)) {
      targets.push({ kind: "hook", detail: violation });
      continue;
    }
    if (/Sonic exclusion leak/i.test(violation)) {
      targets.push({ kind: "sonic_exclusion_leak", detail: violation });
      continue;
    }
    if (/Empty section/i.test(violation)) {
      const section = violation.split(":").slice(1).join(":").trim();
      targets.push({ kind: "section", section, detail: violation });
      continue;
    }
    targets.push({ kind: "structure", detail: violation });
  }

  if ((critique.dimensions.hookStrength ?? 100) < 40) {
    targets.push({ kind: "hook", detail: "clearly weak hook" });
  }
  if ((critique.dimensions.structuralCoherence ?? 100) < 40) {
    targets.push({ kind: "structure", detail: "broken structure" });
  }
  if ((critique.dimensions.singability ?? 100) < 35) {
    targets.push({ kind: "singability", detail: "severe singability issue" });
  }

  return targets;
}

export function shouldRepairCandidate(critique: SongCandidateCritique): boolean {
  return collectRepairTargets(critique).length > 0;
}

export function planRepairPass(args: {
  selected: SongCandidateCritique;
  repairAlreadyUsed: boolean;
}): { shouldRepair: boolean; targets: RepairTarget[] } {
  if (args.repairAlreadyUsed) {
    return { shouldRepair: false, targets: [] };
  }
  const targets = collectRepairTargets(args.selected);
  return { shouldRepair: targets.length > 0, targets };
}

export function pickCandidateById(
  candidates: SongArchitectCandidate[],
  id: string
): SongArchitectCandidate {
  const found = candidates.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`Candidate ${id} was selected but not found.`);
  }
  return found;
}
