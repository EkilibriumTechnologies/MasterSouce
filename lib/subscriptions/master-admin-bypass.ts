import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

/**
 * Owner testing: bypass is granted only when all of these are true:
 * - `x-master-admin-bypass: 1` is present
 * - `x-master-owner-token` header is present
 * - `x-master-owner-token` matches server-only `MASTER_OWNER_TOKEN`
 * Does not log secrets.
 */
export function isMasterAdminBypassGranted(request: NextRequest): boolean {
  const expected = process.env.MASTER_OWNER_TOKEN?.trim();
  if (!expected) return false;
  const bypassFlag = request.headers.get("x-master-admin-bypass")?.trim() ?? "";
  if (bypassFlag !== "1") return false;
  const providedOwnerToken = request.headers.get("x-master-owner-token")?.trim() ?? "";
  if (providedOwnerToken.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(providedOwnerToken, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}
