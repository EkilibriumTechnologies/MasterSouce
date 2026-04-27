export const PREVIEW_START_SECONDS = 60;
export const MIN_DURATION_FOR_ONE_MINUTE_PREVIEW = 90;

export function getPreviewStartSeconds(trackDurationSeconds: number | null | undefined): number {
  if (!Number.isFinite(trackDurationSeconds)) return 0;

  const duration = Math.max(0, Number(trackDurationSeconds));

  const preferredStart =
    duration >= MIN_DURATION_FOR_ONE_MINUTE_PREVIEW
      ? PREVIEW_START_SECONDS
      : duration * 0.25;

  return Math.max(0, Math.min(preferredStart, duration));
}

export function getSafePreviewDurationSeconds(
  trackDurationSeconds: number | null | undefined,
  startSeconds: number,
  requestedDurationSeconds: number
): number {
  if (!Number.isFinite(trackDurationSeconds)) return requestedDurationSeconds;

  const duration = Math.max(0, Number(trackDurationSeconds));
  const safeStart = Math.max(0, Math.min(startSeconds, duration));
  const remaining = duration - safeStart;

  return Math.max(0, Math.min(requestedDurationSeconds, remaining));
}
