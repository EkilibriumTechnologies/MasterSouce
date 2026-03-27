import { z } from "zod";

const emailShape = z.string().email();

/**
 * Normalizes plain emails plus accidental markdown / mailto payloads
 * (e.g. `[user@x.com](mailto:user@x.com)` from pasted rich text).
 * Returns trimmed, lowercased address suitable for deduplication.
 */
export function normalizeCaptureEmail(raw: string): string | null {
  let s = raw.trim();
  const md = /^\[([^\]]*)\]\(mailto:([^)]+)\)$/i.exec(s);
  if (md) {
    s = md[2].trim();
  } else {
    const mdLoose = /\[([^\]]*)\]\(mailto:([^)]+)\)/i.exec(s);
    if (mdLoose) {
      s = mdLoose[2].trim();
    }
  }
  if (/^mailto:/i.test(s)) {
    s = s.replace(/^mailto:/i, "").trim();
  }
  s = s.toLowerCase();
  const parsed = emailShape.safeParse(s);
  return parsed.success ? parsed.data : null;
}
