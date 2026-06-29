const MAX_ADAPTIVE_NOTES_LENGTH = 700;
const MAX_REFERENCE_ARTIST_LENGTH = 120;

/**
 * Normalizes adaptive notes / user intent from any supported request field name.
 */
export function normalizeAdaptiveNotes(fields: Record<string, unknown>): string {
  const raw =
    fields.adaptiveNotes ??
    fields.userIntent ??
    fields.user_intent ??
    fields.notes ??
    "";
  if (typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim();
  if (trimmed.length > MAX_ADAPTIVE_NOTES_LENGTH) {
    return trimmed.slice(0, MAX_ADAPTIVE_NOTES_LENGTH);
  }
  return trimmed;
}

/**
 * Parses optional reference-artist guidance. Empty or whitespace-only values are treated as absent.
 */
export function normalizeReferenceArtist(fields: Record<string, unknown>): string | undefined {
  const raw = fields.referenceArtist;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > MAX_REFERENCE_ARTIST_LENGTH) {
    return trimmed.slice(0, MAX_REFERENCE_ARTIST_LENGTH);
  }
  return trimmed;
}

/** Coerce multipart FormData string fields into a plain record for normalization. */
export function formDataToFieldRecord(formData: FormData): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      continue;
    }
    record[key] = value;
  }
  return record;
}
