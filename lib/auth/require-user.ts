import "server-only";
import { auth } from "./config";
import { isSessionLive, type SessionUser } from "@/lib/server/accounts";

export class Unauthorized extends Error {}

/** The signed-in user, or null if there is no session, the account was deleted, or the session was signed out remotely. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!session || !u?.id || !(await isSessionLive(u.id, session.authAt))) return null;
  return { id: u.id, name: u.name ?? "", email: u.email ?? "", image: u.image ?? null };
}

/** The only source of a userId on the server. Never read a userId from client input. */
export async function requireUserId(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Unauthorized("Not signed in");
  return user.id;
}
