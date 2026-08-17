import { planRepairPass, pickCandidateById, selectBestCandidate, type RepairTarget } from "@/lib/song-architect/candidate-selection";
import { critiqueSongCandidate } from "@/lib/song-architect/critic";
import { analyzePronunciation } from "@/lib/song-architect/pronunciation";
import type {
  PronunciationAnalysis,
  PronunciationOverride,
  SongArchitectCandidate,
  SongArchitectCandidateMode,
  SongArchitectResolvedInput,
  SongArchitectSelectionPresentation,
  SongCandidateCritique,
  SongDNA
} from "@/lib/song-architect/types";

export type SongArchitectPhase4Result = {
  selected: SongArchitectCandidate;
  critiques: SongCandidateCritique[];
  selectedCritique: SongCandidateCritique;
  whyThisVersion: string[];
  scoreDelta: number;
  tied: boolean;
  usedTieBreak: boolean;
  repairRecommended: boolean;
  repairTargets: RepairTarget[];
  pronunciation: PronunciationAnalysis;
  presentation: SongArchitectSelectionPresentation;
  observability: {
    candidateMode: SongArchitectCandidateMode;
    candidateCount: number;
    repaired: boolean;
    selectionScoreDelta: number;
    pronunciationAdjustmentCount: number;
  };
};

export function runSongArchitectPhase4(args: {
  songDNA: SongDNA;
  resolvedInput: SongArchitectResolvedInput;
  candidates: SongArchitectCandidate[];
  candidateMode: SongArchitectCandidateMode;
  pronunciationOverrides?: PronunciationOverride[];
  repairAlreadyUsed?: boolean;
}): SongArchitectPhase4Result {
  if (args.candidates.length === 0) {
    throw new Error("Phase 4 requires at least one songwriting candidate.");
  }

  const critiques = args.candidates.map((candidate) =>
    critiqueSongCandidate(candidate, args.songDNA, args.resolvedInput)
  );
  const selection = selectBestCandidate(critiques);
  const selected = pickCandidateById(args.candidates, selection.winnerId);
  const selectedCritique = critiques.find((critique) => critique.candidateId === selection.winnerId) ?? critiques[0];
  const repair = planRepairPass({
    selected: selectedCritique,
    repairAlreadyUsed: Boolean(args.repairAlreadyUsed)
  });
  const pronunciation = analyzePronunciation({
    cleanLyrics: selected.lyrics,
    sections: selected.lyricsSections,
    songDNA: args.songDNA,
    overrides: args.pronunciationOverrides ?? args.resolvedInput.pronunciationOverrides
  });

  const whyThisVersion = selection.whyThisVersion;
  const presentation: SongArchitectSelectionPresentation = {
    whyThisVersion,
    pronunciationAdjustments: pronunciation.adjustments.map((item) => ({
      word: item.word,
      pronunciation: item.pronunciation
    }))
  };

  return {
    selected,
    critiques,
    selectedCritique,
    whyThisVersion,
    scoreDelta: selection.scoreDelta,
    tied: selection.tied,
    usedTieBreak: selection.usedTieBreak,
    repairRecommended: repair.shouldRepair,
    repairTargets: repair.targets,
    pronunciation,
    presentation,
    observability: {
      candidateMode: args.candidateMode,
      candidateCount: args.candidates.length,
      repaired: Boolean(args.repairAlreadyUsed),
      selectionScoreDelta: selection.scoreDelta,
      pronunciationAdjustmentCount: pronunciation.adjustments.length
    }
  };
}

export function applyRepairedCandidate(
  previous: SongArchitectPhase4Result,
  repaired: SongArchitectCandidate,
  args: {
    songDNA: SongDNA;
    resolvedInput: SongArchitectResolvedInput;
    pronunciationOverrides?: PronunciationOverride[];
  }
): SongArchitectPhase4Result {
  const repairedCritique = critiqueSongCandidate(repaired, args.songDNA, args.resolvedInput);
  const fewerHardViolations =
    repairedCritique.hardConstraintViolations.length < previous.selectedCritique.hardConstraintViolations.length;
  const keepRepaired =
    fewerHardViolations ||
    (repairedCritique.hardConstraintViolations.length === 0 &&
      repairedCritique.overallScore >= previous.selectedCritique.overallScore - 2);
  const selected = keepRepaired ? repaired : previous.selected;
  const selectedCritique = keepRepaired ? repairedCritique : previous.selectedCritique;
  const pronunciation = analyzePronunciation({
    cleanLyrics: selected.lyrics,
    sections: selected.lyricsSections,
    songDNA: args.songDNA,
    overrides: args.pronunciationOverrides ?? args.resolvedInput.pronunciationOverrides
  });
  const whyThisVersion = keepRepaired
    ? [...previous.whyThisVersion.filter((item) => item !== "targeted repair"), "targeted repair"].slice(0, 4)
    : previous.whyThisVersion;

  return {
    ...previous,
    selected,
    selectedCritique,
    critiques: [...previous.critiques.filter((item) => item.candidateId !== repairedCritique.candidateId), repairedCritique],
    whyThisVersion,
    repairRecommended: false,
    repairTargets: [],
    pronunciation,
    presentation: {
      whyThisVersion,
      pronunciationAdjustments: pronunciation.adjustments.map((item) => ({
        word: item.word,
        pronunciation: item.pronunciation
      }))
    },
    observability: {
      ...previous.observability,
      repaired: true,
      pronunciationAdjustmentCount: pronunciation.adjustments.length
    }
  };
}
