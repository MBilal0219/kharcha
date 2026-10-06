import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Unauthorized } from "@/lib/auth/require-user";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Maps thrown errors to responses so route handlers stay short. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Unauthorized) return json({ error: "unauthorized" }, 401);
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
}

export function checkCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Header only: a secret in the URL ends up in access logs. Hashing gives equal lengths for the constant-time compare.
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}
