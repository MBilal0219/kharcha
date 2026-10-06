import { db } from "@/lib/db/client";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Pinged by the keep-alive workflow so the free Atlas cluster never idles out.
export async function GET() {
  try {
    await (await db()).command({ ping: 1 });
    return json({ ok: true, at: new Date().toISOString() });
  } catch {
    return json({ ok: false }, 503);
  }
}
