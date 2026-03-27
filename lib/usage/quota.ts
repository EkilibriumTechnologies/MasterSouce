type UsageCounter = {
  periodKey: string;
  used: number;
};

const USAGE_BY_USER = new Map<string, UsageCounter>();

function getCurrentPeriodKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getMonthlyUsage(userId: string): number {
  const entry = USAGE_BY_USER.get(userId);
  if (!entry) return 0;
  const currentPeriod = getCurrentPeriodKey();
  if (entry.periodKey !== currentPeriod) return 0;
  return entry.used;
}

export function incrementUsage(userId: string): number {
  const currentPeriod = getCurrentPeriodKey();
  const existing = USAGE_BY_USER.get(userId);
  if (!existing || existing.periodKey !== currentPeriod) {
    USAGE_BY_USER.set(userId, { periodKey: currentPeriod, used: 1 });
    return 1;
  }
  existing.used += 1;
  USAGE_BY_USER.set(userId, existing);
  return existing.used;
}
