import { localDb, setMeta } from "./db";
import { starterData } from "@/lib/seed";
import { addDay, dayIndex, localDay, weekStartOf, localDateTimeToISO } from "@/lib/budget/week";
import type { Tx } from "@/lib/types";

// Demo mode (NEXT_PUBLIC_DEMO=1): no sign-in, no server. Fills the phone DB with three weeks of sample data
// so you can try every screen before setting up MongoDB and sign-in.

export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

export async function seedDemo() {
  if ((await localDb.settings.count()) > 0) return;
  const uuid = () => crypto.randomUUID();
  const now = new Date().toISOString();
  const stamp = { updatedAt: now, deletedAt: null, dirty: 0 as const };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const data = starterData("demo", uuid);
  const today = localDay(new Date(), tz);
  const firstWeek = addDay(weekStartOf(today), -14);

  await setMeta("user", { id: "demo", name: "Sam", email: "demo@kharcha.app", image: null });
  await setMeta("demo", true);
  await localDb.settings.bulkPut(
    data.settings.map((r) => ({ ...r, currency: "PKR", budgetAmount: 250000, bufferTarget: 100000, timezone: tz, onboarded: true, ...stamp })),
  );
  await localDb.wallets.bulkPut(data.wallets.map((r) => ({ ...r, ...stamp })));
  await localDb.categories.bulkPut(data.categories.map((r) => ({ ...r, limit: r.key === "food" ? 120000 : null, ...stamp })));
  await localDb.goals.bulkPut(data.goals.map((r) => ({ ...r, target: 100000, ...stamp })));
  await localDb.schedules.put({ id: uuid(), from: firstWeek, period: "weekly", startDow: 0, startDom: 1, offDays: [6], ...stamp });
  const reserve = { id: uuid(), name: "Fare home", kind: "spend" as const, amounts: [{ from: firstWeek, amount: 50000 }], until: null, sort: 0, ...stamp };
  await localDb.reserves.put(reserve);
  await localDb.reserves.put({ id: uuid(), name: "Weekly saving", kind: "save", amounts: [{ from: weekStartOf(today), amount: 20000 }], until: null, sort: 1, ...stamp });

  const cat = (k: string) => data.categories.find((c) => c.key === k)!.id;
  const cash = data.wallets[0].id;
  const buffer = data.goals[0].id;
  const txs: Tx[] = [];
  let seed = 7;
  const rnd = (a: number, b: number) => {
    seed = (seed * 9301 + 49297) % 233280;
    return (a + Math.round(((seed / 233280) * (b - a)) / 10) * 10) * 100;
  };
  const add = (day: string, p: Partial<Tx> & Pick<Tx, "type" | "amount">, time = "09:00:00") =>
    txs.push({
      id: uuid(), needWant: "need", isOneOff: false, walletId: cash, ...p, day,
      occurredAt: localDateTimeToISO(day, time, tz), ...stamp,
    } as Tx);

  const ali = { id: uuid(), name: "Ali", ...stamp };
  await localDb.people.put(ali);
  const loanStart = addDay(weekStartOf(today), -12);
  const loan = { id: uuid(), personId: ali.id, direction: "borrowed" as const, principal: 100000, dueDate: addDay(today, 5), goalId: null, status: "open" as const, createdDay: loanStart, ...stamp };
  await localDb.loans.put(loan);
  add(loanStart, { type: "loan_taken", amount: 100000, loanId: loan.id, note: "Short before payday" }, "19:00:00");

  for (let d = firstWeek; d <= today; d = addDay(d, 1)) {
    const i = dayIndex(d);
    if (i === 6) continue; // day off
    if (i === 0) add(d, { type: "income", amount: 250000, categoryId: cat("budget"), note: "This week's budget" }, "08:00:00");
    if (d === today && i !== 5) continue;
    add(d, { type: "expense", amount: rnd(90, 140), categoryId: cat("food"), note: "Breakfast" }, "08:30:00");
    add(d, { type: "expense", amount: rnd(150, 230), categoryId: cat("food"), note: "Lunch" }, "13:30:00");
    if (i % 2 === 1) add(d, { type: "expense", amount: rnd(40, 70), categoryId: cat("fun"), needWant: "want", note: "Tea with friends" }, "17:00:00");
    if (i === 1 || i === 4) add(d, { type: "income", amount: 15000, categoryId: cat("freelance") }, "20:00:00");
    if (i === 3) add(d, { type: "expense", amount: 4000, categoryId: cat("transport"), note: "Rickshaw" }, "20:05:00");
    if (i === 5 && d !== today) add(d, { type: "expense", amount: 43000, categoryId: cat("transport"), reserveId: reserve.id, note: "Bus home" }, "18:00:00");
    if (i === 2 && d < addDay(today, -6)) add(d, { type: "expense", amount: 30000, categoryId: cat("mobile"), note: "Data bundle" }, "21:00:00");
  }
  add(addDay(weekStartOf(today), -9), { type: "saving", amount: 30000, goalId: buffer, note: "From freelance" }, "20:10:00");
  add(addDay(weekStartOf(today), -2), { type: "loan_repaid", amount: 40000, loanId: loan.id }, "20:00:00");
  add(addDay(weekStartOf(today), -1), { type: "saving", amount: 20000, goalId: buffer, note: "Leftover" }, "21:00:00");

  await localDb.transactions.bulkPut(txs.map((t) => ({ ...t, dirty: 0 as const })));
  await setMeta("sync", { status: "idle", lastSyncedAt: now });
}
