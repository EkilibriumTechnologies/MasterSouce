import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

/**
 * Owner testing: when `MASTER_ADMIN_BYPASS_TOKEN` is set and the request sends
 * matching `x-master-admin-bypass`, quota denial for POST /api/master is skipped.
 * Does not log secrets.
 */
export function isMasterAdminBypassGranted(request: NextRequest): boolean {
  const expected = process.env.MASTER_ADMIN_BYPASS_TOKEN?.trim();
  if (!expected) return false;
  const provided = request.headers.get("x-master-admin-bypass")?.trim() ?? "";
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}
