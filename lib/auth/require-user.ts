import { NextRequest } from "next/server";
import { readAppSession } from "@/lib/auth/app-session";
import { getMasterSauceUserById, type MasterSauceUser } from "@/lib/users/store";

export type AuthenticatedAccount = {
  session: NonNullable<ReturnType<typeof readAppSession>>;
  user: MasterSauceUser;
};

export async function requireAuthenticatedAccount(
  request: NextRequest
): Promise<AuthenticatedAccount | null> {
  const session = readAppSession(request);
  if (!session) return null;
  const user = await getMasterSauceUserById(session.userId);
  if (!user || user.authUserId !== session.authUserId) return null;
  return { session, user };
}
