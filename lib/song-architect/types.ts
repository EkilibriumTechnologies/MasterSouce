import type { ReferenceStyleBlueprint } from "@/lib/song-architect/reference-style-blueprint";

export type SongArchitectSongLength = "short" | "standard" | "extended" | "full";

export type PronunciationOverride = {
  word: string;
  pronunciation: string;
  reason?: string;
};

export type SongArchitectCandidateId = "A" | "B";

export type SongArchitectCandidateMode = "single_candidate" | "multi_candidate";

/** Optional user overrides for Sonic DNA. Omitted fields stay automatic. */
export type SongArchitectSonicControls = {
  bpm?: number;
  groove?: string;
  instrumentFocus?: string;
  productionEra?: string;
  productionTexture?: string;
};

export type { ReferenceStyleBlueprint };

export type SongArchitectInput = {
  preset?: string;
  songLength?: SongArchitectSongLength;
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
  /** Future-proof reference sources. Artist-name strings still map through `referenceArtists`. */
  references?: ReferenceSource[];
  mustInclude?: string[];
  avoidWords?: string[];
  userNotes?: string;
  sonicControls?: SongArchitectSonicControls;
  /** Optional Spotify metadata interpretation. Never overrides explicit user choices. */
  referenceStyleBlueprint?: ReferenceStyleBlueprint;
  /** Future manual pronunciation overrides. Not required for generation. */
  pronunciationOverrides?: PronunciationOverride[];
};

export type SongArchitectResolvedInput = {
  preset?: string;
  songLength: SongArchitectSongLength;
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
  references: ReferenceSource[];
  mustInclude: string[];
  avoidWords: string[];
  userNotes: string;
  sonicControls: SongArchitectSonicControls;
  pronunciationOverrides: PronunciationOverride[];
  referenceStyleBlueprint?: ReferenceStyleBlueprint;
};

export type CompositionDNA = {
  theme: string;
  angle: string;
  emotionalIntent: string;
  hookIdentity: string;
  lyricalPerspective: string;
  language: string;
  structure: string;
  runtime: string;
  lineDensity: "sparse" | "balanced" | "dense";
  vocalStyle: string;
  mustInclude: string[];
  avoidWords: string[];
  energyCurve: string;
};

export type SonicDNA = {
  primaryGenre?: string;
  subgenres?: string[];
  bpm?: number;
  bpmRange?: { min: number; max: number };
  tempoFeel?: string;
  groove?: string;
  coreInstrumentation?: string[];
  supportingInstrumentation?: string[];
  drumCharacter?: string;
  bassCharacter?: string;
  harmonicCharacter?: string;
  vocalDelivery?: string;
  vocalRegister?: string;
  vocalTexture?: string;
  vocalLayering?: string;
  productionAesthetic?: string;
  productionEra?: string;
  distortionSaturation?: string;
  ambience?: string;
  spatialCharacter?: string;
  dynamics?: string;
  emotionalSonicExpression?: string;
};

export type SongDNAGenreFamily =
  | "edm"
  | "hip-hop"
  | "nu-metal"
  | "pop"
  | "acoustic"
  | "reggaeton"
  | "rock"
  | "rnb"
  | "ballad"
  | "generic";

/** Lyric-only constraints. Never mixed with sonic exclusions. */
export type LyricConstraints = Pick<
  CompositionDNA,
  "avoidWords" | "mustInclude" | "lyricalPerspective" | "language"
>;

export type ReferenceSourceType = "artist" | "song" | "audio" | "analyzed_track" | "artist_dna";

export type ReferenceSource = {
  type: ReferenceSourceType;
  label: string;
};

export type InferenceConfidence = "strong" | "likely" | "optional";

export type ReferenceTraitRole = "shared" | "complementary" | "conflicting";

export type ReferenceCharacteristicField =
  | "genreLineage"
  | "subgenreTendencies"
  | "tempoTendencies"
  | "groove"
  | "drumCharacter"
  | "bassCharacter"
  | "instrumentation"
  | "guitarCharacter"
  | "synthCharacter"
  | "vocalDelivery"
  | "vocalRegister"
  | "vocalTexture"
  | "vocalLayering"
  | "harmonicTendencies"
  | "arrangementTendencies"
  | "productionDensity"
  | "distortionSaturation"
  | "ambience"
  | "spatialCharacter"
  | "mixAesthetic"
  | "energyBehavior"
  | "eraInfluence";

export type ReferenceCharacteristics = {
  genreLineage?: string;
  subgenreTendencies?: string[];
  tempoTendencies?: string;
  groove?: string;
  drumCharacter?: string;
  bassCharacter?: string;
  instrumentation?: string[];
  guitarCharacter?: string;
  synthCharacter?: string;
  vocalDelivery?: string;
  vocalRegister?: string;
  vocalTexture?: string;
  vocalLayering?: string;
  harmonicTendencies?: string;
  arrangementTendencies?: string;
  productionDensity?: string;
  distortionSaturation?: string;
  ambience?: string;
  spatialCharacter?: string;
  mixAesthetic?: string;
  energyBehavior?: string;
  eraInfluence?: string;
};

export type ReferenceProfile = {
  source: ReferenceSource;
  characteristics: ReferenceCharacteristics;
  confidence: InferenceConfidence;
  catalogMatch: boolean;
};

export type ResolvedReferenceTrait = {
  field: ReferenceCharacteristicField;
  value: string;
  confidence: InferenceConfidence;
  role: ReferenceTraitRole;
  sources: string[];
  resolution?: string;
};

export type ReferenceDNA = {
  sources: ReferenceSource[];
  profiles: ReferenceProfile[];
  sharedTraits: ResolvedReferenceTrait[];
  complementaryTraits: ResolvedReferenceTrait[];
  conflictingTraits: ResolvedReferenceTrait[];
  influenceSummary: string;
};

export type HarmonyDNA = {
  tonalCenter?: string;
  modeTendency?: string;
  scaleOrMode?: string;
  harmonicCharacter?: string;
  chordLanguage?: string;
  progressionTendencies?: string;
  harmonicRhythm?: string;
  tensionRelease?: string;
  verseBehavior?: string;
  preChorusBehavior?: string;
  chorusBehavior?: string;
  bridgeOrDropBehavior?: string;
  resolutionBehavior?: string;
};

export type SonicExclusions = {
  genres?: string[];
  subgenres?: string[];
  instruments?: string[];
  vocalBehavior?: string[];
  productionStyles?: string[];
  eras?: string[];
  arrangementBehavior?: string[];
  textures?: string[];
  effects?: string[];
  mixCharacteristics?: string[];
};

export type ArrangementSectionRole =
  | "intro"
  | "verse"
  | "pre-chorus"
  | "chorus"
  | "post-chorus"
  | "drop"
  | "breakdown"
  | "bridge"
  | "final-chorus"
  | "outro"
  | "hook"
  | "other";

export type SectionProductionDirection = {
  id: string;
  sectionType: ArrangementSectionRole;
  label: string;
  energy?: number;
  instrumentation?: string[];
  drumDirection?: string;
  bassDirection?: string;
  vocalDirection?: string;
  vocalLayering?: string;
  harmonicDirection?: string;
  productionDirection?: string;
  density?: string;
  spatialDirection?: string;
  transitionIntoNext?: string;
  priorityInstructions?: string[];
};

export type ArrangementDNA = {
  sections: SectionProductionDirection[];
  globalArc?: string;
  transitionStrategy?: string;
};

export type SongDNA = {
  composition: CompositionDNA;
  sonic: SonicDNA;
  reference?: ReferenceDNA;
  harmony?: HarmonyDNA;
  sonicExclusions?: SonicExclusions;
  arrangement?: ArrangementDNA;
  meta: {
    genreFamily: SongDNAGenreFamily;
    inferenceMode: "automatic" | "mixed";
    userOverrides: Array<keyof SongArchitectSonicControls>;
    referenceStyleProvenance?: {
      analysisType: "metadata_reference_interpretation";
      directlyAnalyzedAudio: false;
    };
  };
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

export type SongCandidateCritiqueDimensions = {
  hookStrength?: number;
  hookClarity?: number;
  singability?: number;
  lyricalClarity?: number;
  emotionalPayoff?: number;
  originality?: number;
  structuralCoherence?: number;
  genreFit?: number;
  repetitionBalance?: number;
  imagerySpecificity?: number;
  clicheRisk?: number;
  aiWritingRisk?: number;
  songDNAAdherence?: number;
};

export type SongCandidateCritique = {
  candidateId: string;
  dimensions: SongCandidateCritiqueDimensions;
  hardConstraintViolations: string[];
  strengths: string[];
  weaknesses: string[];
  overallScore: number;
};

export type SongArchitectCandidate = {
  id: SongArchitectCandidateId;
  concept: SongArchitectConcept;
  lyricsSections: SongArchitectLyricsSection[];
  lyrics: string;
  performanceNotes: string[];
  altHooks: string[];
  rawOutputText?: string;
};

export type PronunciationAdjustment = {
  word: string;
  pronunciation: string;
  reason: string;
  source: "auto" | "override";
};

export type PronunciationAnalysis = {
  adjustments: PronunciationAdjustment[];
  cleanLyrics: string;
  generationOptimizedLyrics: string;
};

export type SongArchitectSelectionPresentation = {
  whyThisVersion: string[];
  pronunciationAdjustments: Array<{
    word: string;
    pronunciation: string;
  }>;
};

export type SongArchitectOutput = {
  concept: SongArchitectConcept;
  songDNA: SongDNA;
  stylePrompt: string;
  sunoBlueprint: string;
  /** Human-readable canonical lyrics. Never replaced by phonetic spelling. */
  lyrics: string;
  /** Generation copy. Equals `lyrics` when no pronunciation adjustments are needed. */
  generationOptimizedLyrics: string;
  performanceNotes: string[];
  altHooks: string[];
  /**
   * Authoritative Suno export compiled from Song DNA.
   * Model-generated `exportPrompt` is legacy/fallback only and must not override this.
   * Export lyrics are generation-optimized; human-facing `lyrics` stay clean.
   */
  exportPrompt: string;
  diagnostics: SongArchitectDiagnostics;
  selection?: SongArchitectSelectionPresentation;
  /** Internal compiler metrics. Not shown in the default UI. */
  compilerDiagnostics?: CompilerDiagnostics;
  meta: {
    presetUsed?: string;
    model: string;
    generatedAt: string;
    songLength?: SongArchitectSongLength;
  };
};

/** Advanced Song Architect output unlocked for Creator / Pro Studio plans. */
export type SongArchitectPremiumEnhancements = {
  diagnostics: SongArchitectDiagnostics;
  altHooks: string[];
  performanceNotes: string[];
  exportPrompt: string;
  masteringReadyPrompt: string;
  styleDirections: [string, string, string];
  referenceArtistGuidance: string;
  exportMasteringGuidance: string;
};

/** Model-independent compile destination. Song DNA must not be hard-wired to Suno. */
export type GenerationProvider = "suno" | "generic";

/**
 * Conservative prompt-shaping strategies.
 * Names describe density, not undocumented provider internals.
 */
export type CompilerStrategyId = "default" | "concise" | "extended" | "legacy";

export type GenerationTarget =
  | {
      provider: "suno";
      version?: string;
      strategy?: CompilerStrategyId;
    }
  | {
      provider: "generic";
      version?: string;
      strategy?: CompilerStrategyId;
    };

export type InstructionSource =
  | "explicit_user"
  | "sonic_control"
  | "composition"
  | "reference_strong"
  | "reference_likely"
  | "reference_optional"
  | "harmony"
  | "arrangement"
  | "inferred";

export type InstructionScope = "global" | "local";

/** Character / word / instruction counts. Not model token counts. */
export type PromptBudgets = {
  stylePromptChars: number;
  stylePromptInstructions: number;
  perSectionBlueprintChars: number;
  perSectionBlueprintInstructions: number;
  totalBlueprintChars: number;
  exclusionsCount: number;
  pronunciationAnnotations: number;
  exportPackageChars: number;
};

export type CompilerDiagnostics = {
  target: string;
  strategy: string;
  stylePromptLength: number;
  stylePromptWordCount: number;
  blueprintLength: number;
  blueprintWordCount: number;
  candidateInstructionCount: number;
  selectedInstructionCount: number;
  droppedForRedundancy: number;
  droppedForBudget: number;
  conflictsResolved: number;
  sourceBreakdown?: Record<string, number>;
  fallbackUsed?: boolean;
  unknownTarget?: boolean;
};

export type GenerationPackage = {
  target: GenerationTarget;
  stylePrompt: string;
  blueprint: string;
  cleanLyrics: string;
  generationLyrics: string;
  exportPrompt: string;
  diagnostics?: CompilerDiagnostics;
};
