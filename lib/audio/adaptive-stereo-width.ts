export type AdaptiveStereoIntent = "preserve" | "wider" | "narrower" | "mono" | "unspecified";

export type AdaptiveStereoWidthDecision = "narrow" | "moderate" | "wide";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function classifyAdaptiveStereoIntent(userIntent: string | undefined): AdaptiveStereoIntent {
  const intent = userIntent?.toLowerCase() ?? "";
  if (!intent.trim()) return "unspecified";

  if (/\b(vintage mono|true mono|mono master|make it mono|collapse to mono)\b/.test(intent)) {
    return "mono";
  }

  if (/\b(narrower|narrow and intimate|make (it|this|the mix|the master) narrow|less wide|reduce (the )?(stereo )?width|reduce stereo width|tighter stereo)\b/.test(intent)) {
    return "narrower";
  }

  if (
    /\b(preserve|retain|maintain|keep)\b.{0,48}\b(stereo|width|wide|left-right|left right|separation|image|side channel)\b/.test(intent) ||
    /\b(do not|don't|dont|without)\b.{0,40}\b(narrow|narrowing|collapse|collapsing|mono|reduce the side|reduce side)\b/.test(intent) ||
    /\boriginal stereo\b|\bexisting left-right\b|\bexisting left right\b/.test(intent)
  ) {
    return "preserve";
  }

  if (/\b(narrow|intimate)\b/.test(intent)) {
    return "narrower";
  }

  if (/\b(wide|wider|spacious|expand|more stereo|bigger stereo|open stereo)\b/.test(intent)) {
    return "wider";
  }

  return "unspecified";
}

export function mapAdaptiveStereoWidth(
  decision: AdaptiveStereoWidthDecision,
  intent: AdaptiveStereoIntent
): number {
  if (intent === "preserve") return 1;
  if (intent === "mono") return 0.35;
  if (intent === "narrower") return decision === "wide" ? 0.9 : 0.82;
  if (intent === "wider") return decision === "narrow" ? 1.04 : decision === "wide" ? 1.1 : 1.06;

  if (decision === "wide") return 1.08;
  if (decision === "narrow") return 0.96;
  return 1;
}

export function resolveAdaptiveStereoWidthMultiplier(stereoWidth: number): number {
  return clamp(stereoWidth, 0.35, 1.2);
}

export function shouldApplyAdaptiveStereoWidthFilter(stereoWidth: number): boolean {
  return Math.abs(resolveAdaptiveStereoWidthMultiplier(stereoWidth) - 1) >= 0.005;
}
