/** Father's Day Weekend 2026 promotional campaign (Stripe code: Fatherday26). */

export const FATHERS_DAY_PROMO_CODE = "Fatherday26";

export const FATHERS_DAY_DISCOUNT_PERCENT = 50;

/** Jun 22, 2026 11:59:59 PM in the visitor's local timezone. */
export const FATHERS_DAY_PROMO_END_MS = new Date(2026, 5, 22, 23, 59, 59, 999).getTime();

export const FATHERS_DAY_POPUP_STORAGE_KEY = "ms_fathers_day_popup_dismissed_at";

export const FATHERS_DAY_POPUP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function isFathersDayPromoActive(nowMs: number = Date.now()): boolean {
  return nowMs < FATHERS_DAY_PROMO_END_MS;
}

export function getFathersDayPromoRemainingMs(nowMs: number = Date.now()): number {
  return Math.max(0, FATHERS_DAY_PROMO_END_MS - nowMs);
}

export function getFathersDayPromotionalPriceUsd(monthlyPriceUsd: number): number {
  const discounted = monthlyPriceUsd * (1 - FATHERS_DAY_DISCOUNT_PERCENT / 100);
  return Math.round(discounted * 100) / 100;
}

export function formatFathersDayPromoPriceUsd(monthlyPriceUsd: number): string {
  const discounted = getFathersDayPromotionalPriceUsd(monthlyPriceUsd);
  return Number.isInteger(discounted) ? String(discounted) : discounted.toFixed(2);
}

export function shouldShowFathersDayPopup(nowMs: number = Date.now()): boolean {
  if (!isFathersDayPromoActive(nowMs)) return false;
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(FATHERS_DAY_POPUP_STORAGE_KEY);
    if (!raw) return true;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return true;
    return nowMs - dismissedAt >= FATHERS_DAY_POPUP_COOLDOWN_MS;
  } catch {
    return true;
  }
}

export function recordFathersDayPopupDismissed(nowMs: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FATHERS_DAY_POPUP_STORAGE_KEY, String(nowMs));
  } catch {
    /* ignore storage errors */
  }
}
