import { requireUserId } from "@/lib/auth/require-user";
import { handle, json } from "@/lib/server/http";
import { sendToUser } from "@/lib/server/push";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    const userId = await requireUserId();
    const sent = await sendToUser(userId, {
      kind: "test",
      title: "Reminders are on",
      body: "You'll get a nudge in the evening if you haven't logged anything.",
      url: "/",
    });
    return json({ sent });
  });
}
