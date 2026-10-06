import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db/client";

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys are not set");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  configured = true;
}

export interface PushPayload {
  kind: "daily" | "weekly" | "loan" | "test";
  title: string;
  body: string;
  url?: string;
  day?: string;
  always?: boolean; // sent whether or not anything was logged, so the phone must not replace it with "already logged"
  since?: string; // ISO time: a later reminder of the day only concerns entries logged after this
}

/** Sends to every device of a user. Dead subscriptions (404/410) are removed. Returns devices reached. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  configure();
  const col = (await db()).collection("pushSubscriptions");
  const subs = await col.find({ userId }).toArray();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 6, urgency: "normal" },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await col.deleteOne({ _id: s._id });
        else console.error("push failed", code, (e as Error).message);
      }
    }),
  );
  return sent;
}
