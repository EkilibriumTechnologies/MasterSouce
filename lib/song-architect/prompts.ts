import { CORE_SONGWRITING_RULES } from "@/lib/song-architect/rules";
import { buildSongLengthPromptSection } from "@/lib/song-architect/song-length";
import type { SongArchitectOutput, SongArchitectResolvedInput } from "@/lib/song-architect/types";

export function buildSystemPrompt(input: SongArchitectResolvedInput): string {
  const rules = CORE_SONGWRITING_RULES.map((rule, idx) => `${idx + 1}. ${rule}`).join("\n");
  const durationBlock = buildSongLengthPromptSection(input.songLength);

  return `You are MasterSauce Song Architect, an elite songwriting blueprint engine for modern AI music creators.
Generate structured, premium songwriting blueprints optimized for AI music workflows.

Core songwriting rules:
${rules}

When the song length tier below conflicts with a core rule above, follow the length tier for runtime, word count, section count, and chorus depth.

Song length tier (authoritative for quantity and architecture):
${durationBlock}

Preset and genre behavior:
- Genre: ${input.genre}
- Line density: ${input.lineDensity}
- Vocal style: ${input.vocalStyle}
- Structure target (baseline; expand or adapt per length tier as needed): ${input.structure}
- Energy curve target: ${input.energyCurve}
- Language: ${input.language}

Formatting contract:
- Return JSON only.
- Do not include markdown code fences.
- Do not include any commentary before or after JSON.
- All strings must be valid JSON strings.
- Do not include extra keys.
- JSON keys required exactly: concept, lyricsSections, performanceNotes, altHooks, exportPrompt.
- concept keys required exactly: theme, angle, emotion, hookIdentity, tensionWords, structure, energyCurve.
- lyricsSections must be an array of objects with keys: section, lines.
- section must be a short non-empty string.
- lines must be arrays of plain lyric strings only.
- Keep output structurally clean and commercially credible for the selected length tier.
- Keep lines concise per section; earn word count through section count and returns, not rambling lines.
- If unsure, prefer shorter output over malformed output.
- Output must be parseable JSON.`;
}

export function buildUserPrompt(input: SongArchitectResolvedInput): string {
  return JSON.stringify(
    {
      requestType: "song_architect_blueprint",
      input
    },
    null,
    2
  );
}

export function buildExportPrompt(
  output: Pick<SongArchitectOutput, "concept" | "lyrics">,
  options?: { runtimeLabel?: string }
): string {
  const head = [
    options?.runtimeLabel ? `Target runtime: ${options.runtimeLabel}` : null,
    `Structure: ${output.concept.structure}`,
    `Theme: ${output.concept.theme}`,
    `Emotion: ${output.concept.emotion}`,
    `Hook identity: ${output.concept.hookIdentity}`
  ].filter(Boolean) as string[];

  return [...head, "", "Lyrics blueprint:", output.lyrics].join("\n");
}
