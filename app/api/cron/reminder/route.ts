import { checkCronSecret, handle, json } from "@/lib/server/http";
import { runDaily } from "@/lib/server/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called every hour by cron-job.org. Each user gets their reminders when their own evening arrives.
async function run(req: Request) {
  if (!checkCronSecret(req)) return json({ error: "unauthorized" }, 401);
  return handle(async () => json({ result: await runDaily() }));
}

export const GET = run;
export const POST = run;
