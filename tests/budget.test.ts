import { describe, expect, it } from "vitest";
import { summarizePeriod, indexCategories, moneySplit, walletBalances, loanStates, loggingStreak, goalBalances } from "@/lib/budget/calc";
import { isWorkDay, periodOf, reserveAmountFor, sortSchedules, type Overrides, type ScheduleLike } from "@/lib/budget/period";
import { buildReport } from "@/lib/budget/report";
import { flipId, isSharedTx, mirrorLoan, mirrorTx } from "@/lib/links/mirror";
import { localDay, weekStartOf, dayIndex } from "@/lib/budget/week";
import { money, num, parseAmount, toInput } from "@/lib/money";
import type { Category, Tx, Wallet, Loan, Goal, Reserve } from "@/lib/types";

const meta = { updatedAt: "2026-10-01T00:00:00Z", deletedAt: null };
const cat = (id: string, key: string, kind: "expense" | "income"): Category => ({
  id, key, name: key, kind, icon: "circle", archived: false, sort: 0, ...meta,
});
const cats = indexCategories([cat("c-food", "food", "expense"), cat("c-bus", "transport", "expense"), cat("c-budget", "budget", "income"), cat("c-free", "freelance", "income")]);

let n = 0;
function tx(p: Partial<Tx> & Pick<Tx, "type" | "amount" | "day">): Tx {
  return { id: `t${++n}`, needWant: "need", isOneOff: false, occurredAt: `${p.day}T08:00:00Z`, walletId: "w-cash", ...meta, ...p };
}

// Amounts are hundredths: R(2500) is 2,500.00
const R = (major: number) => major * 100;
const WEEK = "2026-09-28"; // Monday
const sixDay: ScheduleLike = { from: "2026-01-05", period: "weekly", startDow: 0, startDom: 1, offDays: [6] }; // Sunday off
const fare: Reserve = { id: "r-fare", name: "Fare home", kind: "spend", amounts: [{ from: "2026-01-05", amount: R(500) }], until: null, sort: 0, ...meta };

function sum(txs: Tx[], today: string, opts: { schedules?: ScheduleLike[]; reserves?: Reserve[]; overrides?: Overrides; setting?: { carryIn: number; reservesOff: string[] } } = {}) {
  const schedules = sortSchedules(opts.schedules ?? [sixDay]);
  return summarizePeriod({
    txs,
    cats,
    period: periodOf(today, schedules),
    reserves: opts.reserves ?? [fare],
    setting: opts.setting,
    today,
    isWork: (d) => isWorkDay(d, schedules, opts.overrides),
  });
}

describe("money", () => {
  it("formats by currency and keeps hundredths", () => {
    expect(money(R(2500), "PKR")).toBe("Rs 2,500");
    expect(money(1250, "USD")).toBe("$12.50");
    expect(money(R(12), "USD")).toBe("$12");
    expect(money(-R(40), "PKR")).toBe("−Rs 40");
    expect(num(R(1000), "EUR")).toBe("1,000");
  });

  it("parses typed amounts into hundredths", () => {
    expect(parseAmount("2,500", "PKR")).toBe(R(2500));
    expect(parseAmount("12.5", "USD")).toBe(1250);
    expect(parseAmount("12.5", "PKR")).toBe(R(13)); // rupees have no decimals
    expect(parseAmount("abc", "USD")).toBe(0);
    expect(toInput(1250)).toBe("12.5");
  });
});

describe("periods", () => {
  it("finds weekly periods from any start day", () => {
    expect(weekStartOf("2026-10-03")).toBe(WEEK);
    expect(dayIndex(WEEK)).toBe(0);
    const p = periodOf("2026-10-03", [sixDay]);
    expect([p.start, p.end, p.days.length]).toEqual([WEEK, "2026-10-04", 7]);
    const friday = periodOf("2026-10-01", [{ ...sixDay, startDow: 4 }]); // Thursday, week starts Friday
    expect([friday.start, friday.end]).toEqual(["2026-09-25", "2026-10-01"]);
  });

  it("finds two-week and monthly periods", () => {
    const two = [{ ...sixDay, period: "biweekly" as const }];
    expect(periodOf("2026-01-05", two).end).toBe("2026-01-18");
    expect(periodOf("2026-01-19", two).start).toBe("2026-01-19");
    expect(periodOf("2026-10-01", two).days.length).toBe(14);

    const monthly = [{ ...sixDay, period: "monthly" as const, startDom: 25 }];
    const p = periodOf("2026-10-03", monthly);
    expect([p.start, p.end]).toEqual(["2026-09-25", "2026-10-24"]);
    expect(periodOf("2026-01-10", monthly).start).toBe("2025-12-25");
  });

  it("uses the user's time zone for the day boundary", () => {
    // 20:30 UTC is 01:30 next day in Karachi
    expect(localDay("2026-10-02T20:30:00Z", "Asia/Karachi")).toBe("2026-10-03");
    expect(localDay("2026-10-02T20:30:00Z", "America/New_York")).toBe("2026-10-02");
  });

  it("keeps the same period when only the days off change", () => {
    const newJob = { ...sixDay, from: "2026-09-30", offDays: [4, 5] }; // from Wednesday: Friday and Saturday off
    const list = sortSchedules([sixDay, newJob]);
    expect(periodOf("2026-09-30", list).start).toBe(WEEK);
    expect(isWorkDay("2026-10-04", list)).toBe(true); // Sunday now works
    expect(isWorkDay("2026-10-02", list)).toBe(false); // Friday off
    expect(isWorkDay("2026-09-27", list)).toBe(false); // the Sunday before the change is still off
  });

  it("ends the old period and starts a new one when the layout changes", () => {
    const monthly = { ...sixDay, from: "2026-09-30", period: "monthly" as const, startDom: 1 };
    const list = sortSchedules([sixDay, monthly]);
    const before = periodOf("2026-09-29", list);
    expect([before.start, before.end]).toEqual([WEEK, "2026-09-29"]);
    const after = periodOf("2026-09-30", list);
    expect([after.start, after.end]).toEqual(["2026-09-30", "2026-09-30"]); // short first period up to the 1st
    expect(periodOf("2026-10-15", list).start).toBe("2026-10-01");
  });

  it("lets a single date override the week", () => {
    const overrides: Overrides = new Map([["2026-09-30", "off"], ["2026-10-04", "work"]]);
    expect(isWorkDay("2026-09-30", [sixDay], overrides)).toBe(false);
    expect(isWorkDay("2026-10-04", [sixDay], overrides)).toBe(true);
  });
});

describe("summarizePeriod", () => {
  const budget = tx({ type: "income", amount: R(2500), day: WEEK, categoryId: "c-budget" });

  it("locks the reserve and splits the rest over the working days", () => {
    const s = sum([budget], WEEK);
    expect(s.reserveLocked).toBe(R(500));
    expect(s.spendable).toBe(R(2000));
    expect(s.workDays).toBe(6);
    expect(s.dailyLimit).toBe(Math.floor(R(2000) / 6));
    expect(s.budgetLogged).toBe(true);
  });

  it("never goes negative just because money is set aside", () => {
    const nothing = sum([], WEEK);
    expect([nothing.spendable, nothing.reserveLocked, nothing.reserveShort]).toEqual([0, 0, R(500)]);
    const little = sum([tx({ type: "income", amount: R(300), day: WEEK, categoryId: "c-free" })], WEEK);
    expect([little.spendable, little.reserveLocked, little.reserveShort]).toEqual([0, R(300), R(200)]);
    const overspent = sum([tx({ type: "income", amount: R(100), day: WEEK, categoryId: "c-free" }), tx({ type: "expense", amount: R(250), day: WEEK, categoryId: "c-food" })], WEEK);
    expect([overspent.spendable, overspent.reserveLocked]).toEqual([-R(150), 0]); // only real overspending shows as negative
  });

  it("splits over five days for a two-day weekend", () => {
    const s = sum([budget], WEEK, { schedules: [{ ...sixDay, offDays: [5, 6] }] });
    expect(s.workDays).toBe(5);
    expect(s.dailyLimit).toBe(R(400));
  });

  it("recomputes the daily limit from what is left", () => {
    const txs = [budget, tx({ type: "expense", amount: R(500), day: WEEK, categoryId: "c-food" }), tx({ type: "expense", amount: R(100), day: "2026-09-29", categoryId: "c-food" })];
    const s = sum(txs, "2026-09-29");
    // spendable = 2500 - 600 - 500 locked = 1400; available at start of Tue = 1500; 5 days left
    expect(s.spendable).toBe(R(1400));
    expect(s.dailyLimit).toBe(R(300));
    expect(s.leftToday).toBe(R(200));
    expect(s.pace).toBe("over"); // spent 500 on Monday vs ~333 planned
  });

  it("recounts the days left when the weekend changes mid-week", () => {
    // 3,000 with no reserve, 1,200 spent on Mon–Tue, so 1,800 left on Wednesday.
    const txs = [
      tx({ type: "income", amount: R(3000), day: WEEK, categoryId: "c-budget" }),
      tx({ type: "expense", amount: R(1200), day: "2026-09-29", categoryId: "c-food" }),
    ];
    const old = sum(txs, "2026-09-30", { reserves: [] });
    expect([old.daysLeft, old.dailyLimit]).toEqual([4, R(450)]); // Wed–Sat
    const newJob = { ...sixDay, from: "2026-09-30", offDays: [4, 5] };
    const now = sum(txs, "2026-09-30", { reserves: [], schedules: [sixDay, newJob] });
    expect([now.daysLeft, now.dailyLimit]).toEqual([3, R(600)]); // Wed, Thu, Sun
  });

  it("shows the period left on a day off", () => {
    const s = sum([budget], "2026-10-04"); // Sunday
    expect(s.isOffToday).toBe(true);
    expect(s.daysLeft).toBe(1);
  });

  it("releases the reserve once it is paid and reports the leftover", () => {
    const txs = [budget, tx({ type: "expense", amount: R(430), day: "2026-10-03", categoryId: "c-bus", reserveId: "r-fare" })];
    const s = sum(txs, "2026-10-03");
    expect(s.reserveLocked).toBe(0);
    expect(s.reserveSpent).toBe(R(430));
    expect(s.reserveLeftover).toBe(R(70));
    expect(s.spent).toBe(0); // paid from the reserve, not from daily spending
    expect(s.spendable).toBe(R(2070));
  });

  it("releases the reserve when switched off for the period and adds carry-over", () => {
    const s = sum([budget], WEEK, { setting: { carryIn: R(120), reservesOff: ["r-fare"] } });
    expect(s.reserveLocked).toBe(0);
    expect(s.spendable).toBe(R(2620));
  });

  it("holds back a saving target until it is saved, and a one-off buy for its period only", () => {
    const target: Reserve = { id: "r-save", name: "Weekly saving", kind: "save", amounts: [{ from: WEEK, amount: R(500) }], until: null, sort: 1, ...meta };
    const gift: Reserve = { id: "r-gift", name: "Gift", kind: "spend", amounts: [{ from: WEEK, amount: R(300) }], until: "2026-10-04", sort: 2, ...meta };
    const all = [fare, target, gift];
    const held = sum([budget], WEEK, { reserves: all });
    expect(held.reserveLocked).toBe(R(1300));
    expect(held.dailyLimit).toBe(R(200)); // (2500 - 1300) / 6

    const saved = sum([budget, tx({ type: "saving", amount: R(500), day: "2026-09-30", goalId: "g1", reserveId: "r-save" })], "2026-09-30", { reserves: all });
    expect(saved.reserveLocked).toBe(R(800)); // the target is met, so it stops holding money back
    expect(saved.spendable).toBe(R(2500 - 500 - 800)); // and the 500 is counted once, as saved

    const next = sum([tx({ type: "income", amount: R(2500), day: "2026-10-05", categoryId: "c-budget" })], "2026-10-05", { reserves: all });
    expect(next.reserves.map((r) => r.reserve.name)).toEqual(["Fare home", "Weekly saving"]); // the gift was for last week only
  });

  it("uses the reserve amount each period had", () => {
    const changed: Reserve = { ...fare, amounts: [...fare.amounts, { from: "2026-10-05", amount: R(800) }] };
    expect(reserveAmountFor(changed, periodOf(WEEK, [sixDay]))).toBe(R(500));
    expect(reserveAmountFor(changed, periodOf("2026-10-06", [sixDay]))).toBe(R(800));
    expect(reserveAmountFor({ ...fare, until: "2026-10-04" }, periodOf("2026-10-06", [sixDay]))).toBe(null);
    expect(reserveAmountFor(fare, { end: "2025-12-31" })).toBe(null); // before it existed
  });

  it("adds other money in to the budget and takes savings out", () => {
    const txs = [budget, tx({ type: "income", amount: R(150), day: WEEK, categoryId: "c-free" }), tx({ type: "saving", amount: R(75), day: WEEK, goalId: "g1" })];
    const s = sum(txs, WEEK);
    expect(s.otherIncome).toBe(R(150));
    expect(s.spendable).toBe(R(2500 + 150 - 75 - 500));
  });

  it("splits the period's money into parts that add up, and shows money in per day", () => {
    const txs = [
      budget,
      tx({ type: "income", amount: R(310), day: "2026-09-29", categoryId: "c-free" }),
      tx({ type: "saving", amount: R(310), day: "2026-09-29", goalId: "g1" }),
      tx({ type: "expense", amount: R(550), day: "2026-09-29", categoryId: "c-food" }),
      tx({ type: "expense", amount: R(430), day: "2026-10-03", categoryId: "c-bus", reserveId: "r-fare" }),
      tx({ type: "loan_given", amount: R(100), day: "2026-09-30", loanId: "l9" }),
    ];
    const s = sum(txs, "2026-10-03");
    const m = moneySplit(s);
    expect(m).toEqual({ total: R(2810), left: R(1420), over: 0, spent: R(550), saved: R(310), setAside: R(430), lent: R(100) });
    expect(m.left + m.spent + m.saved + m.setAside + m.lent - m.over).toBe(m.total);
    expect(s.dailySpend.filter((d) => d.income).map((d) => [d.day, d.income])).toEqual([[WEEK, R(2500)], ["2026-09-29", R(310)]]);

    const over = moneySplit(sum([tx({ type: "income", amount: R(100), day: WEEK, categoryId: "c-free" }), tx({ type: "expense", amount: R(250), day: WEEK, categoryId: "c-food" })], WEEK));
    expect([over.left, over.over]).toEqual([0, R(150)]);
    expect(over.left + over.spent + over.saved + over.setAside + over.lent - over.over).toBe(over.total);
  });

  it("works for a monthly budget and gives a figure for the next 7 days", () => {
    const monthly = [{ ...sixDay, period: "monthly" as const, startDom: 1, offDays: [5, 6] }];
    const txs = [tx({ type: "income", amount: R(22000), day: "2026-10-01", categoryId: "c-budget" })];
    const s = sum(txs, "2026-10-01", { schedules: monthly, reserves: [] });
    expect(s.workDays).toBe(22); // weekdays in October 2026
    expect(s.dailyLimit).toBe(R(1000));
    expect(s.weekSafe).toBe(R(5000)); // Thu, Fri, Mon, Tue, Wed
  });

  it("ignores deleted entries and other periods", () => {
    const txs = [
      budget,
      { ...tx({ type: "expense", amount: R(999), day: WEEK, categoryId: "c-food" }), deletedAt: "2026-09-28T10:00:00Z" },
      tx({ type: "expense", amount: R(300), day: "2026-09-27", categoryId: "c-food" }),
    ];
    expect(sum(txs, WEEK).spent).toBe(0);
  });
});

describe("report", () => {
  it("separates reserve payments and lists where money came from", () => {
    const days = periodOf(WEEK, [sixDay]).days;
    const r = buildReport(
      [
        tx({ type: "income", amount: R(2500), day: WEEK, categoryId: "c-budget" }),
        tx({ type: "income", amount: R(150), day: WEEK, categoryId: "c-free" }),
        tx({ type: "expense", amount: R(200), day: WEEK, categoryId: "c-food" }),
        tx({ type: "saving", amount: R(100), day: WEEK, goalId: "g1" }),
        tx({ type: "expense", amount: R(430), day: "2026-10-03", categoryId: "c-bus", reserveId: "r-fare" }),
      ],
      cats,
      days,
    );
    expect([r.spent, r.reserved, r.budget, r.otherIncome]).toEqual([R(630), R(430), R(2500), R(150)]);
    expect(r.incomeCategories.map((c) => c.category?.key)).toEqual(["budget", "freelance"]);
    expect(r.daily.find((d) => d.day === "2026-10-03")?.spent).toBe(0);
    expect(r.daily.find((d) => d.day === WEEK)).toEqual({ day: WEEK, spent: R(200), income: R(2650), saved: R(100) });
    expect(r.weekly[0]).toEqual({ weekStart: WEEK, income: R(2650), spent: R(630), saved: R(100) });
  });
});

describe("linked people", () => {
  const loan: Loan = { id: "l1", personId: "p-ahmed", direction: "borrowed", principal: R(500), dueDate: "2026-10-10", status: "open", createdDay: WEEK, ...meta };
  const taken = tx({ type: "loan_taken", amount: R(500), day: WEEK, loanId: "l1", walletId: "w-cash", note: "Short this week" });

  it("shows the other person the same loan from their side", () => {
    const theirs = mirrorLoan(loan, "me", "ahmed", "p-me");
    expect(theirs).toMatchObject({ id: "l1:m", personId: "p-me", direction: "lent", principal: R(500), dueDate: "2026-10-10", by: "me" });
    const t = mirrorTx(taken, "me", "ahmed");
    expect(t).toMatchObject({ id: taken.id + ":m", type: "loan_given", loanId: "l1:m", amount: R(500), day: WEEK, by: "me" });
    expect(t.walletId).toBeUndefined(); // wallets are each person's own

    // Both sides work out the same amount still owed.
    const repay = tx({ type: "loan_repaid", amount: R(200), day: "2026-09-30", loanId: "l1" });
    const mine = loanStates([loan], [taken, repay])[0];
    const other = loanStates([theirs], [t, mirrorTx(repay, "me", "ahmed")])[0];
    expect([mine.outstanding, other.outstanding]).toEqual([R(300), R(300)]);
  });

  it("goes back to the original when the other person changes their copy", () => {
    const theirs = { ...mirrorLoan(loan, "me", "ahmed", "p-me"), status: "closed" as const, updatedAt: "2026-10-02T00:00:00Z" };
    const back = mirrorLoan(theirs, "ahmed", "me", "p-ahmed");
    expect(back).toMatchObject({ id: "l1", personId: "p-ahmed", direction: "borrowed", status: "closed", updatedAt: "2026-10-02T00:00:00Z" });
    expect(back.by).toBeUndefined(); // it is still my own loan
    expect(flipId(flipId("abc"))).toBe("abc");
  });

  it("marks an entry the other person added", () => {
    const collected = tx({ type: "loan_collected", amount: R(100), day: "2026-10-01", loanId: "l1:m" }); // Ahmed records that I paid him
    const mine = mirrorTx(collected, "ahmed", "me");
    expect(mine).toMatchObject({ type: "loan_repaid", loanId: "l1", by: "ahmed" });
  });

  it("shares only loan movements between people", () => {
    expect(isSharedTx(taken)).toBe(true);
    expect(isSharedTx(tx({ type: "expense", amount: 1, day: WEEK }))).toBe(false);
    expect(isSharedTx(tx({ type: "saving", amount: 1, day: WEEK, loanId: "l2" }))).toBe(false); // paying back your own savings
    expect(isSharedTx(tx({ type: "loan_taken", amount: 1, day: WEEK }))).toBe(false);
  });
});

describe("balances and loans", () => {
  const wallets: Wallet[] = [
    { id: "w-cash", name: "Cash", isDefault: true, sort: 0, ...meta },
    { id: "w-bank", name: "Bank", isDefault: false, sort: 1, ...meta },
  ];

  it("moves money between wallets and ignores savings jars", () => {
    const txs = [
      tx({ type: "income", amount: 2500, day: WEEK, categoryId: "c-budget" }),
      tx({ type: "transfer", amount: 1000, day: WEEK, walletId: "w-cash", toWalletId: "w-bank" }),
      tx({ type: "expense", amount: 200, day: WEEK, walletId: "w-bank", categoryId: "c-food" }),
      tx({ type: "saving", amount: 300, day: WEEK, goalId: "g1" }),
    ];
    const b = walletBalances(txs, wallets);
    expect(b.get("w-cash")).toBe(1500);
    expect(b.get("w-bank")).toBe(800);
    const goals: Goal[] = [{ id: "g1", name: "Buffer", target: 1000, kind: "buffer", sort: 0, ...meta }];
    expect(goalBalances(txs, goals).get("g1")).toBe(300);
  });

  it("tracks loan outstanding", () => {
    const loan: Loan = { id: "l1", personId: "p1", direction: "borrowed", principal: 1000, status: "open", createdDay: WEEK, ...meta };
    const txs = [tx({ type: "loan_taken", amount: 1000, day: WEEK, loanId: "l1" }), tx({ type: "loan_repaid", amount: 400, day: "2026-09-30", loanId: "l1" })];
    const [st] = loanStates([loan], txs);
    expect(st.paid).toBe(400);
    expect(st.outstanding).toBe(600);
  });

  it("counts a logging streak", () => {
    const days = new Set(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(loggingStreak(days, "2026-10-03")).toBe(3);
    expect(loggingStreak(days, "2026-10-04")).toBe(3); // today not logged yet
    expect(loggingStreak(days, "2026-10-06")).toBe(0);
  });
});
