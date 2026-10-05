export const JOURNEY_STAGES = [
  {
    id: "idea",
    label: "Idea",
    description: "Capture the song goal, story, references, and constraints."
  },
  {
    id: "song_dna",
    label: "Song DNA",
    description: "Define the musical identity and arrangement blueprint."
  },
  {
    id: "lyrics",
    label: "Lyrics",
    description: "Develop lyrics, sections, delivery, and arrangement intent."
  },
  {
    id: "suno_prompt",
    label: "Suno Prompt",
    description: "Compile the production-ready generation prompt."
  },
  {
    id: "generation",
    label: "Generate",
    description: "Create candidate versions in Suno and bring them back."
  },
  {
    id: "analyze_refine",
    label: "Analyze & Refine",
    description: "Compare intent vs result and improve the next generation."
  },
  {
    id: "selected_generation",
    label: "Lock Version",
    description: "Choose the generation that moves forward."
  },
  {
    id: "master",
    label: "Master",
    description: "Analyze readiness and create the final master."
  },
  {
    id: "export",
    label: "Export",
    description: "Download final assets and finish the song."
  },
  {
    id: "complete",
    label: "Complete",
    description: "Finished song."
  }
] as const;

export type JourneyStageId = (typeof JOURNEY_STAGES)[number]["id"];

export const JOURNEY_STAGE_IDS = JOURNEY_STAGES.map((stage) => stage.id) as [
  JourneyStageId,
  ...JourneyStageId[]
];

export function isJourneyStageId(value: unknown): value is JourneyStageId {
  return typeof value === "string" && JOURNEY_STAGES.some((stage) => stage.id === value);
}

export function getJourneyStageIndex(stage: JourneyStageId): number {
  return JOURNEY_STAGES.findIndex((item) => item.id === stage);
}

export function getJourneyStage(stage: JourneyStageId) {
  return JOURNEY_STAGES.find((item) => item.id === stage) ?? JOURNEY_STAGES[0];
}

