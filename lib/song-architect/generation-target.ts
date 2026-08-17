import type { CompilerStrategyId, GenerationProvider, GenerationTarget } from "@/lib/song-architect/types";

export type ResolvedGenerationTarget = {
  provider: GenerationProvider;
  version?: string;
  strategy: CompilerStrategyId;
  unknownTarget: boolean;
};

const STRATEGIES = new Set<CompilerStrategyId>(["default", "concise", "extended", "legacy"]);

function asStrategy(value: string | undefined): CompilerStrategyId | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (STRATEGIES.has(normalized as CompilerStrategyId)) {
    return normalized as CompilerStrategyId;
  }
  if (normalized === "short" || normalized === "modern") return "concise";
  if (normalized === "long") return "extended";
  return undefined;
}

/**
 * Map an optional version hint to a conservative strategy.
 * Unknown version strings fall back to default. This does not claim
 * exact provider-version prompt behavior.
 */
export function strategyForVersionHint(version?: string): CompilerStrategyId {
  const mapped = asStrategy(version);
  return mapped ?? "default";
}

export function resolveCompilerStrategy(input?: {
  strategy?: string;
  version?: string;
}): CompilerStrategyId {
  return asStrategy(input?.strategy) ?? strategyForVersionHint(input?.version);
}

export function resolveGenerationTarget(input?: {
  provider?: string;
  version?: string;
  strategy?: string;
}): ResolvedGenerationTarget {
  const strategy = resolveCompilerStrategy(input);
  const providerRaw = input?.provider?.trim().toLowerCase();

  if (!providerRaw || providerRaw === "suno") {
    return {
      provider: "suno",
      ...(input?.version?.trim() ? { version: input.version.trim() } : {}),
      strategy,
      unknownTarget: false
    };
  }

  if (providerRaw === "generic") {
    return {
      provider: "generic",
      ...(input?.version?.trim() ? { version: input.version.trim() } : {}),
      strategy,
      unknownTarget: false
    };
  }

  return {
    provider: "generic",
    ...(input?.version?.trim() ? { version: input.version.trim() } : {}),
    strategy: "default",
    unknownTarget: true
  };
}

export function toGenerationTarget(resolved: ResolvedGenerationTarget): GenerationTarget {
  if (resolved.provider === "suno") {
    return {
      provider: "suno",
      ...(resolved.version ? { version: resolved.version } : {}),
      strategy: resolved.strategy
    };
  }
  return {
    provider: "generic",
    ...(resolved.version ? { version: resolved.version } : {}),
    strategy: resolved.strategy
  };
}

export function formatTargetLabel(resolved: ResolvedGenerationTarget): string {
  const version = resolved.version ? `:${resolved.version}` : "";
  const unknown = resolved.unknownTarget ? ":unknown" : "";
  return `${resolved.provider}${version}${unknown}`;
}
