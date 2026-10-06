import "server-only";
import type { Document } from "mongodb";
import { db } from "@/lib/db/client";
import { sendToUser } from "./push";
import { addDay, localDay, localHour, DEFAULT_TZ } from "@/lib/budget/week";
import { indexCategories, summarizePeriod, loanStates } from "@/lib/budget/calc";
import { isWorkDay, periodNoun, periodOf, sortSchedules, type Overrides } from "@/lib/budget/period";
import { money } from "@/lib/money";
import type { Category, DayOverride, Loan, PeriodSetting, Reserve, Schedule, Settings, Tx } from "@/lib/types";

function isDupKey(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;
}

/** Inserting the log row first makes every reminder at-most-once per user/day/kind, even if the cron retries. */
async function claim(userId: string, day: string, kind: string) {
  try {
    await (await db()).collection("reminderLog").insertOne({ userId, day, kind, at: new Date() });
    return true;
  } catch (e) {
    if (isDupKey(e)) return false;
    throw e;
  }
}

async function usersWithPush(): Promise<string[]> {
  return (await (await db()).collection("pushSubscriptions").distinct("userId")) as string[];
}

/** The user's current budget period, summed from what has reached the server. */
async function loadPeriod(userId: string, today: string) {
  const database = await db();
  const live = { userId, deletedAt: null };
  const toRec = <T,>(d: Document) => ({ ...d, id: String(d._id) }) as unknown as T;
  const [schedules, overrides, cats, reserves] = await Promise.all([
    database.collection("schedules").find(live).toArray(),
    database.collection("dayOverrides").find(live).toArray(),
    database.collection("categories").find(live).toArray(),
    database.collection("reserves").find(live).toArray(),
  ]);
  const sorted = sortSchedules(schedules.map(toRec<Schedule>));
  const marks: Overrides = new Map(overrides.map(toRec<DayOverride>).map((o) => [o.day, o.kind]));
  const period = periodOf(today, sorted);
  const [txs, setting] = await Promise.all([
    database.collection("transactions").find({ ...live, day: { $gte: period.start, $lte: period.end } }).toArray(),
    database.collection("periodSettings").findOne({ ...live, periodStart: period.start }),
  ]);
  const sum = summarizePeriod({
    txs: txs.map(toRec<Tx>),
    cats: indexCategories(cats.map(toRec<Category>)),
    period,
    reserves: reserves.map(toRec<Reserve>),
    setting: setting ? toRec<PeriodSetting>(setting) : null,
    today,
    isWork: (day) => isWorkDay(day, sorted, marks),
  });
  return { period, sum };
}

/**
 * Meant to be called every hour. Each user is handled once their own clock reaches their reminder hour,
 * so people in different time zones all get the nudge in their evening.
 */
export async function runDaily(now = new Date()) {
  const database = await db();
  const results: Record<string, string> = {};
  for (const userId of await usersWithPush()) {
    const settings = (await database.collection("settings").findOne({ userId })) as unknown as Settings | null;
    const tz = settings?.timezone ?? DEFAULT_TZ;
    const currency = settings?.currency ?? "USD";
    if (localHour(now, tz) < (settings?.reminderHour ?? 22)) {
      results[userId] = "too-early";
      continue;
    }
    const today = localDay(now, tz);

    // Loan due today or tomorrow
    const due = (await database
      .collection("loans")
      .find({ userId, deletedAt: null, status: "open", dueDate: { $in: [today, addDay(today, 1)] } })
      .toArray()) as unknown as (Loan & { _id: string })[];
    if (due.length) {
      const ids = due.map((l) => String(l._id));
      const repay = (await database.collection("transactions").find({ userId, deletedAt: null, loanId: { $in: ids } }).toArray()) as unknown as Tx[];
      const states = loanStates(due.map((l) => ({ ...l, id: String(l._id) })), repay).filter((s) => s.outstanding > 0);
      if (states.length && (await claim(userId, today, "loan"))) {
        const total = states.reduce((a, s) => a + s.outstanding, 0);
        await sendToUser(userId, {
          kind: "loan",
          title: "Loan due soon",
          body: `${money(total, currency)} is due ${states.some((s) => s.loan.dueDate === today) ? "today" : "tomorrow"}.`,
          url: "/money?tab=loans",
          day: today,
        });
      }
    }

    const { period, sum } = await loadPeriod(userId, today);
    const noun = periodNoun(period.kind);

    // Summary on the last day of the budget period
    if (period.end === today && sum.moneyIn > 0 && (await claim(userId, today, "weekly"))) {
      const leftover = Math.max(sum.spendable, 0);
      await sendToUser(userId, {
        kind: "weekly",
        title: `Your ${noun} in numbers`,
        body: `Spent ${money(sum.spent, currency)}, saved ${money(sum.saved, currency)}.${leftover ? ` ${money(leftover, currency)} left over. Move it to savings?` : ""}`,
        url: "/reports",
        day: today,
      });
    }

    const logged =
      (await database.collection("transactions").findOne({ userId, day: today, deletedAt: null })) ||
      (await database.collection("dayClosures").findOne({ userId, day: today, deletedAt: null }));
    if (logged) {
      results[userId] = "logged";
      continue;
    }
    if (!(await claim(userId, today, "daily"))) {
      results[userId] = "already-sent";
      continue;
    }
    const left = sum.moneyIn > 0 ? ` ${money(Math.max(sum.spendable, 0), currency)} left this ${noun}.` : "";
    await sendToUser(userId, {
      kind: "daily",
      title: "Add today's expenses",
      body: `Nothing logged today yet.${left} Takes 10 seconds.`,
      url: "/add",
      day: today,
    });
    results[userId] = "sent";
  }
  return results;
}
