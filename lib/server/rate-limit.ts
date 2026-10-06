import "server-only";
import { db } from "@/lib/db/client";

interface Bucket {
  _id: string;
  count: number;
  expiresAt: Date;
}

let indexReady: Promise<unknown> | null = null;

/** Fixed-window counter in MongoDB. Returns false once `key` has been hit more than `limit` times in the window. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const col = (await db()).collection<Bucket>("rateLimits");
  indexReady ??= col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {
    indexReady = null;
  });
  await indexReady;

  const windowMs = windowSec * 1000;
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  try {
    const doc = await col.findOneAndUpdate(
      { _id: `${key}:${start}` },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(start + windowMs) } },
      { upsert: true, returnDocument: "after" },
    );
    return (doc?.count ?? 1) <= limit;
  } catch (e) {
    // Two first hits can race on the upsert; the loser is still within the limit.
    if ((e as { code?: number }).code === 11000) return true;
    throw e;
  }
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
