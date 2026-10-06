import { requireUserId } from "@/lib/auth/require-user";
import { dataEpoch } from "@/lib/server/accounts";
import { handle, json } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { handleSync, type SyncBody } from "@/lib/server/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    if (!(await rateLimit(`sync:${userId}`, 120, 60))) return json({ error: "rate_limited" }, 429);
    const body = (await req.json().catch(() => null)) as SyncBody | null;
    if (!body || typeof body !== "object") return json({ error: "bad_request" }, 400);
    // The phone holds another account's data (the session changed under it): take nothing from it.
    if (typeof body.user === "string" && body.user !== userId) return json({ error: "wrong_user" }, 409);
    // A phone still holding data from before a "start over" must drop it instead of pushing it back.
    const epoch = await dataEpoch(userId);
    if ((typeof body.epoch === "number" ? body.epoch : 0) !== epoch) return json({ reset: true, epoch });
    const since = typeof body.since === "string" && !Number.isNaN(Date.parse(body.since)) ? body.since : null;
    return json({ ...(await handleSync(userId, { since, changes: body.changes ?? {} })), epoch });
  });
}
