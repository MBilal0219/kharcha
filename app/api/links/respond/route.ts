import { z } from "zod";
import { currentUser } from "@/lib/auth/require-user";
import { handle, json } from "@/lib/server/http";
import { LinkError, respond } from "@/lib/server/links";

export const dynamic = "force-dynamic";

const Body = z.object({ id: z.string().min(1).max(120), accept: z.boolean() });

/** Accept or decline an invitation from inside the app. Only the invited email's own account can answer. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "bad_request" }, 400);
    try {
      await respond(user, { id: parsed.data.id }, parsed.data.accept);
    } catch (e) {
      if (e instanceof LinkError) return json({ error: e.code }, 400);
      throw e;
    }
    return json({ ok: true });
  });
}
