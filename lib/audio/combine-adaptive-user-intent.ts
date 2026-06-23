/**
 * Merges adaptive notes and optional reference-artist guidance for OpenAI instruction generation.
 * Notes are preserved; reference artist is appended as directional context.
 */
export function combineAdaptiveUserIntent(
  notes?: string,
  referenceArtist?: string
): string | undefined {
  const trimmedNotes = notes?.trim();
  const trimmedArtist = referenceArtist?.trim();
  if (!trimmedArtist) {
    return trimmedNotes || undefined;
  }
  const artistGuidance = `Reference artist/sound: ${trimmedArtist}`;
  if (!trimmedNotes) {
    return artistGuidance;
  }
  return `${trimmedNotes}\n${artistGuidance}`;
}
