import type { SongArchitectPreset } from "@/lib/song-architect/types";

export const SONG_ARCHITECT_PRESETS: SongArchitectPreset[] = [
  {
    id: "radio-pop",
    label: "Radio Pop",
    description: "Hook-forward mainstream pop with clean emotional payoff.",
    defaults: {
      genre: "pop",
      structure: "Verse 1 > Pre-Chorus > Chorus > Verse 2 > Bridge > Final Chorus",
      energyCurve: "steady lift with final chorus peak",
      lineDensity: "balanced",
      vocalStyle: "clean, melodic, direct"
    }
  },
  {
    id: "dark-trap-rap",
    label: "Dark Trap Rap",
    description: "High-detail bars, tension-heavy pre-chorus, chantable hook.",
    defaults: {
      genre: "rap",
      structure: "Verse 1 > Hook > Verse 2 > Bridge/Pivot > Final Hook",
      energyCurve: "brooding start, aggressive center, maximal final hook",
      lineDensity: "dense",
      vocalStyle: "rhythmic, gritty, punchy"
    }
  },
  {
    id: "festival-edm",
    label: "Festival EDM Vocal",
    description: "Sparse lyric density with drop-oriented chorus identity.",
    defaults: {
      genre: "edm",
      structure: "Verse 1 > Pre-Chorus > Chorus/Drop > Verse 2 > Build > Final Chorus/Drop",
      energyCurve: "low verse tension, explosive chorus/drop peaks",
      lineDensity: "sparse",
      vocalStyle: "anthemic topline with short punch lines"
    }
  },
  {
    id: "cinematic-ballad",
    label: "Cinematic Ballad",
    description: "Narrative emotional arc with spacious melodic phrasing.",
    defaults: {
      genre: "ballad",
      structure: "Verse 1 > Pre-Chorus > Chorus > Verse 2 > Bridge > Final Chorus",
      energyCurve: "gradual emotional rise with wide final chorus",
      lineDensity: "balanced",
      vocalStyle: "breathy, intimate, cinematic"
    }
  }
];

export function getSongArchitectPresetById(presetId?: string): SongArchitectPreset | null {
  if (!presetId) return null;
  return SONG_ARCHITECT_PRESETS.find((preset) => preset.id === presetId) ?? null;
}
