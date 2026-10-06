import { currentUser, requireUserId } from "@/lib/auth/require-user";
import { deleteAccount } from "@/lib/server/accounts";
import { handle, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    return user ? json(user) : json({ error: "unauthorized" }, 401);
  });
}

/** Deletes the account and all of its data. */
export async function DELETE() {
  return handle(async () => {
    await deleteAccount(await requireUserId());
    return json({ ok: true });
  });
}
