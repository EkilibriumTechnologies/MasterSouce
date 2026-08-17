import { CORE_SONGWRITING_RULES } from "@/lib/song-architect/rules";
import { formatSongDNAForPrompt, toPromptSongDNA } from "@/lib/song-architect/song-dna";
import { buildSongLengthPromptSection } from "@/lib/song-architect/song-length";
import { compileSunoExportPrompt } from "@/lib/song-architect/suno-compiler";
import type {
  SongArchitectCandidate,
  SongArchitectOutput,
  SongArchitectResolvedInput,
  SongDNA
} from "@/lib/song-architect/types";

export function buildSystemPrompt(input: SongArchitectResolvedInput, songDNA: SongDNA): string {
  const rules = CORE_SONGWRITING_RULES.map((rule, idx) => `${idx + 1}. ${rule}`).join("\n");
  const durationBlock = buildSongLengthPromptSection(input.songLength);

  return `You are MasterSauce Song Architect, an elite songwriting blueprint engine for modern AI music creators.
Generate structured, premium songwriting blueprints optimized for AI music workflows.

Planning vs writing:
- Canonical Song DNA is already the plan and the single source of truth.
- Do not reinterpret the user's intent, theme, angle, hook identity, language, structure, emotion, Must Include, Avoid Words, vocal direction, or runtime.
- Your job is execution: write one candidate's lyrics, hook phrasing, imagery, and section wording from that Song DNA.
- Natural variation in phrasing, meter, imagery, and repetition is welcome. Changing strategy is not.

Core songwriting rules:
${rules}

When the song length tier below conflicts with a core rule above, follow the length tier for runtime, word count, section count, and chorus depth.

Song length tier (authoritative for quantity and architecture):
${durationBlock}

Canonical Song DNA (source of truth — do not invent a second interpretation of this song):
${formatSongDNAForPrompt(songDNA)}

Creative brief reading order:
- Composition DNA is the story, hook, structure, and vocal identity.
- Resolved Sonic DNA is the intended final sound. Do not invent a second sonic story from references.
- Harmony DNA is descriptive harmonic guidance, not a claim of exact concert keys or chord-for-chord reproduction.
- Arrangement DNA is section intensity and production behavior. Energy is arrangement intensity, not mastering loudness.
- Lyric constraints (avoid words, must-include, perspective, language) are separate from sonic constraints.
- Sonic exclusions are production/instrument/vocal restrictions only. Never treat Avoid Words as sonic exclusions.
- Never reuse sonic-exclusion wording as lyric imagery, chant lines, or hooks (for example, do not turn “festival EDM drops” or “no generic EDM drop” into phrases like “dance the drop”).
- exportPrompt is generated for schema compatibility only. The canonical Suno style prompt and blueprint are compiled from Song DNA after you return and will replace any model-created exportPrompt.

Emotional intent vs sonic expression:
- Emotional intent is the feeling the song is about.
- Sonic expression is how that feeling is realized musically (tonality, percussion behavior, register, harmonic motion, spatial dynamics).
- Do not stop at adjective lists. Write lyrics, performance notes, and the style block so they honor the sonic expression.
- Do not imitate named artists. The resolved sonic direction is sufficient without artist names.

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

export function buildUserPrompt(
  input: SongArchitectResolvedInput,
  songDNA: SongDNA,
  options?: { candidateSlot?: "A" | "B" }
): string {
  const { referenceArtists: _referenceArtists, references: _references, pronunciationOverrides: _overrides, ...generationInput } =
    input;
  return JSON.stringify(
    {
      requestType: "song_architect_blueprint",
      songDNA: toPromptSongDNA(songDNA),
      input: generationInput,
      writingTask: {
        role: "candidate_generator",
        candidateSlot: options?.candidateSlot ?? "A",
        varyExecutionNotStrategy: true,
        preserve: [
          "theme",
          "angle",
          "hook identity",
          "language",
          "structure",
          "emotional intent",
          "must include",
          "avoid words",
          "vocal direction",
          "requested runtime"
        ],
        allowedVariation: ["lyrical phrasing", "hook execution", "meter", "imagery", "repetition", "section wording"]
      }
    },
    null,
    2
  );
}

export function buildRepairSystemPrompt(input: SongArchitectResolvedInput, songDNA: SongDNA): string {
  return `${buildSystemPrompt(input, songDNA)}

Targeted repair mode:
- Do not rewrite the whole song unless a listed target requires it.
- Preserve strong sections exactly when they are not named in the repair targets.
- Fix only the listed problems (forbidden words, missing must-include, missing section, weak hook, broken meter, language, sonic-exclusion lyric leakage).
- If a repair target names sonic-exclusion leakage, rewrite the offending lyric phrase so it no longer echoes excluded EDM-drop / festival-drop language while preserving the song’s theme and hook.
- Return the same JSON contract.`;
}

export function buildRepairUserPrompt(args: {
  songDNA: SongDNA;
  candidate: Pick<SongArchitectCandidate, "concept" | "lyrics" | "performanceNotes" | "altHooks">;
  targets: Array<{ kind: string; section?: string; detail: string }>;
}): string {
  return JSON.stringify(
    {
      requestType: "song_architect_targeted_repair",
      songDNA: toPromptSongDNA(args.songDNA),
      repairTargets: args.targets,
      preserveUnlistedSections: true,
      currentCandidate: {
        concept: args.candidate.concept,
        lyrics: args.candidate.lyrics,
        performanceNotes: args.candidate.performanceNotes,
        altHooks: args.candidate.altHooks
      }
    },
    null,
    2
  );
}

export function buildExportPrompt(
  output: Pick<SongArchitectOutput, "concept" | "lyrics">,
  options?: { runtimeLabel?: string; songDNA?: SongDNA }
): string {
  if (options?.songDNA) {
    return compileSunoExportPrompt(options.songDNA, {
      lyrics: output.lyrics,
      concept: output.concept,
      runtimeLabel: options.runtimeLabel
    });
  }

  const head = [
    options?.runtimeLabel ? `Target runtime: ${options.runtimeLabel}` : null,
    `Structure: ${output.concept.structure}`,
    `Theme: ${output.concept.theme}`,
    `Hook identity: ${output.concept.hookIdentity}`
  ].filter(Boolean) as string[];

  return [...head, "", "LYRICS", output.lyrics].join("\n");
}
