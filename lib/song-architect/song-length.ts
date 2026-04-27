import type { SongArchitectSongLength } from "@/lib/song-architect/types";

export const SONG_ARCHITECT_SONG_LENGTH_IDS: readonly SongArchitectSongLength[] = ["short", "standard", "extended", "full"];

export const SONG_ARCHITECT_SONG_LENGTH_DEFAULT: SongArchitectSongLength = "standard";

export function parseSongArchitectSongLength(value: unknown): SongArchitectSongLength {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((SONG_ARCHITECT_SONG_LENGTH_IDS as readonly string[]).includes(trimmed)) {
      return trimmed as SongArchitectSongLength;
    }
  }
  return SONG_ARCHITECT_SONG_LENGTH_DEFAULT;
}

export type SongLengthUiOption = {
  id: SongArchitectSongLength;
  label: string;
  hint: string;
  description: string;
};

export const SONG_LENGTH_UI_OPTIONS: SongLengthUiOption[] = [
  {
    id: "short",
    label: "Short",
    hint: "~2 min",
    description: "Tight radio edit feel — hook-forward, minimal sections."
  },
  {
    id: "standard",
    label: "Standard",
    hint: "~3 min",
    description: "Commercial single length — full arc, industry default."
  },
  {
    id: "extended",
    label: "Extended",
    hint: "~4 min",
    description: "Room for post-chorus, bigger bridge, and development."
  },
  {
    id: "full",
    label: "Full Length",
    hint: "~5+ min",
    description: "Album-style journey — tags, breakdowns, and expanded finales."
  }
];

export type SongLengthBlueprint = {
  id: SongArchitectSongLength;
  runtimeLabel: string;
  targetMinutesMin: number;
  targetMinutesMax: number;
  totalLyricWordCountMin: number;
  totalLyricWordCountMax: number;
  sectionCountMin: number;
  sectionCountMax: number;
  linesPerVerseTypicalMin: number;
  linesPerVerseTypicalMax: number;
  chorusLinesMin: number;
  chorusLinesMax: number;
  structureTemplate: string;
  structureExpansionNotes: string;
  performanceNotesMin: number;
  performanceNotesMax: number;
  altHooksMin: number;
  altHooksMax: number;
  openAiMaxOutputTokensFirstAttempt: number;
};

export function getSongLengthBlueprint(length: SongArchitectSongLength): SongLengthBlueprint {
  switch (length) {
    case "short":
      return {
        id: "short",
        runtimeLabel: "~2 minutes",
        targetMinutesMin: 1.75,
        targetMinutesMax: 2.25,
        totalLyricWordCountMin: 160,
        totalLyricWordCountMax: 320,
        sectionCountMin: 5,
        sectionCountMax: 9,
        linesPerVerseTypicalMin: 4,
        linesPerVerseTypicalMax: 8,
        chorusLinesMin: 3,
        chorusLinesMax: 4,
        structureTemplate:
          "Intro (optional, very short) > Verse 1 > Pre-Chorus > Chorus > Verse 2 > Chorus > Outro (optional)",
        structureExpansionNotes:
          "Keep sections lean. One bridge only if genre demands it; prefer skipping bridge or merging with final chorus lift.",
        performanceNotesMin: 4,
        performanceNotesMax: 7,
        altHooksMin: 3,
        altHooksMax: 5,
        openAiMaxOutputTokensFirstAttempt: 2000
      };
    case "extended":
      return {
        id: "extended",
        runtimeLabel: "~4 minutes",
        targetMinutesMin: 3.5,
        targetMinutesMax: 4.25,
        totalLyricWordCountMin: 360,
        totalLyricWordCountMax: 580,
        sectionCountMin: 9,
        sectionCountMax: 14,
        linesPerVerseTypicalMin: 6,
        linesPerVerseTypicalMax: 12,
        chorusLinesMin: 4,
        chorusLinesMax: 6,
        structureTemplate:
          "Verse 1 > Pre-Chorus > Chorus > Post-Chorus (optional) > Verse 2 > Pre-Chorus > Chorus > Bridge > Final Chorus (extended) > Outro",
        structureExpansionNotes:
          "Include a distinct bridge with contrast. Allow post-chorus or hook reinforcement section where genre fits.",
        performanceNotesMin: 6,
        performanceNotesMax: 10,
        altHooksMin: 4,
        altHooksMax: 6,
        openAiMaxOutputTokensFirstAttempt: 3400
      };
    case "full":
      return {
        id: "full",
        runtimeLabel: "~5+ minutes",
        targetMinutesMin: 5,
        targetMinutesMax: 6.5,
        totalLyricWordCountMin: 480,
        totalLyricWordCountMax: 900,
        sectionCountMin: 11,
        sectionCountMax: 18,
        linesPerVerseTypicalMin: 8,
        linesPerVerseTypicalMax: 16,
        chorusLinesMin: 4,
        chorusLinesMax: 8,
        structureTemplate:
          "Intro > Verse 1 > Pre-Chorus > Chorus > Verse 2 > Pre-Chorus > Chorus > Bridge > Breakdown or Strip (genre-appropriate) > Build > Final Chorus (extended, may include hook doubles) > Tag > Outro",
        structureExpansionNotes:
          "Use additional development sections (second pre, breakdown, tag, outro) so runtime and word count match a commercial long-form track. Final chorus should feel like the biggest moment.",
        performanceNotesMin: 7,
        performanceNotesMax: 10,
        altHooksMin: 5,
        altHooksMax: 6,
        openAiMaxOutputTokensFirstAttempt: 4800
      };
    case "standard":
    default:
      return {
        id: "standard",
        runtimeLabel: "~3 minutes",
        targetMinutesMin: 2.6,
        targetMinutesMax: 3.4,
        totalLyricWordCountMin: 260,
        totalLyricWordCountMax: 440,
        sectionCountMin: 7,
        sectionCountMax: 11,
        linesPerVerseTypicalMin: 5,
        linesPerVerseTypicalMax: 10,
        chorusLinesMin: 4,
        chorusLinesMax: 4,
        structureTemplate:
          "Verse 1 > Pre-Chorus > Chorus > Verse 2 > Bridge > Final Chorus (with lift)",
        structureExpansionNotes:
          "Classic single architecture; bridge required unless genre is drop-first EDM (then use build/breakdown labels appropriately).",
        performanceNotesMin: 5,
        performanceNotesMax: 9,
        altHooksMin: 4,
        altHooksMax: 6,
        openAiMaxOutputTokensFirstAttempt: 2600
      };
  }
}

export function buildSongLengthPromptSection(length: SongArchitectSongLength): string {
  const b = getSongLengthBlueprint(length);
  return [
    `Song length tier: ${b.id} (${b.runtimeLabel} target, roughly ${b.targetMinutesMin}–${b.targetMinutesMax} min at typical tempos).`,
    `Estimated total LYRIC word count (count all words across every line in lyricsSections): aim for ${b.totalLyricWordCountMin}–${b.totalLyricWordCountMax} words inclusive.`,
    `Section count: include at least ${b.sectionCountMin} and at most ${b.sectionCountMax} entries in lyricsSections (each entry is one labeled section).`,
    `Typical verse depth: about ${b.linesPerVerseTypicalMin}–${b.linesPerVerseTypicalMax} lines per verse section (adjust for sparse/dense lineDensity and genre).`,
    `Chorus sections: about ${b.chorusLinesMin}–${b.chorusLinesMax} lines each unless genre explicitly needs a repeated hook grid (rap/EDM).`,
    `Recommended structure spine: ${b.structureTemplate}`,
    `Structure notes: ${b.structureExpansionNotes}`,
    `concept.structure must be a concise roadmap string that reflects the actual sections you output (you may extend the user's structure hint to satisfy this tier).`,
    `concept.energyCurve must explicitly describe how intensity maps across the full runtime.`,
    `performanceNotes: include ${b.performanceNotesMin}–${b.performanceNotesMax} items tailored to this length (pacing, drops, ad-libs, dynamics).`,
    `altHooks: include ${b.altHooksMin}–${b.altHooksMax} distinct hook lines or angles.`,
    `exportPrompt must mention target runtime (${b.runtimeLabel}) and that lyrics are written to fill that duration commercially.`,
    `Do not pad with filler words; commercial songs earn length through narrative, hook returns, and section contrast.`,
    `Preserve the user's genre, lineDensity, vocalStyle, language, theme, angle, emotion, hookIdentity, referenceArtists, mustInclude, and avoidWords — only adapt quantity and architecture to the length tier.`
  ].join("\n");
}
