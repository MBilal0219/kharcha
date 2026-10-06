import { requireUserId } from "@/lib/auth/require-user";
import { resetUserData } from "@/lib/server/accounts";
import { handle, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Start over: deletes all of the user's entries and settings, keeps the account. */
export async function POST() {
  return handle(async () => {
    await resetUserData(await requireUserId());
    return json({ ok: true });
  });
}
