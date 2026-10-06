import { z } from "zod";
import { currentUser, Unauthorized } from "@/lib/auth/require-user";
import { handle, json } from "@/lib/server/http";
import { end, incoming, invite, LinkError } from "@/lib/server/links";
import { rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

async function me() {
  const user = await currentUser();
  if (!user) throw new Unauthorized("Not signed in");
  return user;
}

/** Invitations waiting for the signed-in user. */
export async function GET() {
  return handle(async () => json({ incoming: await incoming(await me()) }));
}

const Invite = z.object({ personId: z.string().min(1).max(120), email: z.string().max(254) });

/** Invite one of your people, by email, to share the loans between you. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await me();
    const parsed = Invite.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "bad_request" }, 400);
    if (!(await rateLimit(`invite:${user.id}`, 20, 60 * 60))) return json({ error: "rate_limited" }, 429);
    try {
      await invite(user, parsed.data.personId, parsed.data.email);
    } catch (e) {
      if (e instanceof LinkError) return json({ error: e.code }, 400);
      throw e;
    }
    return json({ ok: true });
  });
}

/** Stop sharing with a person (or cancel an invite that wasn't answered). */
export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await me();
    const personId = new URL(req.url).searchParams.get("personId");
    if (!personId) return json({ error: "bad_request" }, 400);
    await end(user.id, personId);
    return json({ ok: true });
  });
}
