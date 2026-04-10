/** Current page as `returnTo` after Stripe (client-only). */
export function buildAdaptiveCheckoutReturnTo(): string {
  if (typeof window === "undefined") return "/?intent=adaptive#master";
  const u = new URL(window.location.href);
  u.searchParams.set("intent", "adaptive");
  u.searchParams.delete("checkout");
  u.searchParams.delete("kind");
  u.searchParams.delete("upgraded");
  u.searchParams.delete("session_id");
  return `${u.pathname}${u.search}#master`;
}

/** Build /pricing link with adaptive intent and safe returnTo (client-only). */
export function buildAdaptivePricingLink(): string {
  if (typeof window === "undefined") {
    return "/pricing?intent=adaptive&returnTo=%2F%3Fintent%3Dadaptive%23master";
  }
  const returnTo = buildAdaptiveCheckoutReturnTo();
  return `/pricing?intent=adaptive&returnTo=${encodeURIComponent(returnTo)}`;
}
