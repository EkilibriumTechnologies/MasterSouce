export type SongArchitectInput = {
  preset?: string;
  genre?: string;
  theme?: string;
  angle?: string;
  emotion?: string;
  hookIdentity?: string;
  structure?: string;
  energyCurve?: string;
  language?: string;
  vocalStyle?: string;
  lineDensity?: "sparse" | "balanced" | "dense";
  referenceArtists?: string[];
  mustInclude?: string[];
  avoidWords?: string[];
  userNotes?: string;
};

export type SongArchitectResolvedInput = {
  preset?: string;
  genre: string;
  theme: string;
  angle: string;
  emotion: string;
  hookIdentity: string;
  structure: string;
  energyCurve: string;
  language: string;
  vocalStyle: string;
  lineDensity: "sparse" | "balanced" | "dense";
  referenceArtists: string[];
  mustInclude: string[];
  avoidWords: string[];
  userNotes: string;
};

export type SongArchitectPreset = {
  id: string;
  label: string;
  description: string;
  defaults: Partial<SongArchitectResolvedInput>;
};

export type SongArchitectConcept = {
  theme: string;
  angle: string;
  emotion: string;
  hookIdentity: string;
  tensionWords: string[];
  structure: string;
  energyCurve: string;
};

export type SongArchitectDiagnostics = {
  chorusPunch: number;
  lineClarity: number;
  rhythmConsistency: number;
  energyProgression: number;
  hookIdentity: number;
  endingImpact: number;
  uniqueness: number;
  overallScore: number;
};

export type SongArchitectLyricsSection = {
  section: string;
  lines: string[];
};

export type SongArchitectModelOutput = {
  concept: SongArchitectConcept;
  lyricsSections: SongArchitectLyricsSection[];
  performanceNotes: string[];
  altHooks: string[];
  exportPrompt?: string;
};

export type SongArchitectOutput = {
  concept: SongArchitectConcept;
  stylePrompt: string;
  lyrics: string;
  performanceNotes: string[];
  altHooks: string[];
  exportPrompt: string;
  diagnostics: SongArchitectDiagnostics;
  meta: {
    presetUsed?: string;
    model: string;
    generatedAt: string;
  };
};
