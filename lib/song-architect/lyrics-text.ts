import type { SongArchitectLyricsSection } from "@/lib/song-architect/types";

export function foldLyricText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function assembleLyricsFromSections(sections: SongArchitectLyricsSection[]): string {
  const blocks: string[] = [];
  for (const section of sections) {
    blocks.push(`[${section.section}]`);
    blocks.push(...section.lines);
  }
  return blocks.join("\n").trim();
}

export function flattenLyricLines(sections: SongArchitectLyricsSection[]): string[] {
  return sections.flatMap((section) => section.lines.map((line) => line.trim()).filter(Boolean));
}

export function lyricBodyText(sections: SongArchitectLyricsSection[]): string {
  return flattenLyricLines(sections).join("\n");
}

export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}’']+/gu);
  return matches?.length ?? 0;
}

export function tokenizeLyricLine(line: string): string[] {
  return (line.match(/[\p{L}\p{N}’']+/gu) ?? []).map((token) => token.replace(/^[’']+|[’']+$/g, "")).filter(Boolean);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function includesFoldedPhrase(haystack: string, needle: string): boolean {
  const foldedHay = foldLyricText(haystack);
  const foldedNeedle = foldLyricText(needle).trim();
  if (!foldedNeedle) return false;
  return foldedHay.includes(foldedNeedle);
}

export function hasFoldedWordBoundary(haystack: string, needle: string): boolean {
  const foldedHay = foldLyricText(haystack);
  const foldedNeedle = foldLyricText(needle).trim();
  if (!foldedNeedle) return false;
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(foldedNeedle)}(?:$|[^\\p{L}\\p{N}])`, "u");
  return pattern.test(foldedHay);
}

export function isBilingualLanguage(language: string): boolean {
  return /bilingual|both|mix|spanglish|english\s*(and|&|\/)\s*spanish|spanish\s*(and|&|\/)\s*english/i.test(
    language
  );
}

export function languageFamily(language: string): "english" | "spanish" | "mixed" | "other" {
  if (isBilingualLanguage(language)) return "mixed";
  if (/\bspanish|espanol|español|castellano\b/i.test(language)) return "spanish";
  if (/\benglish|ingles|inglés\b/i.test(language)) return "english";
  return "other";
}
