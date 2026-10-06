import { z } from "zod";
import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db/client";
import { handle, json } from "@/lib/server/http";
import { ensureIndexes } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

const Sub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const parsed = Sub.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "bad_request" }, 400);
    const database = await db();
    await ensureIndexes(database);
    await database.collection("pushSubscriptions").updateOne(
      { endpoint: parsed.data.endpoint },
      { $set: { userId, keys: parsed.data.keys, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    return json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
    if (!body.endpoint) return json({ error: "bad_request" }, 400);
    await (await db()).collection("pushSubscriptions").deleteOne({ endpoint: body.endpoint, userId });
    return json({ ok: true });
  });
}
