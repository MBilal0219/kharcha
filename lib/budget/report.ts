import type { Tx } from "@/lib/types";
import { catKey, categoryTotals, type CatIndex } from "./calc";
import { monthDays, weekStartOf } from "./week";

// Pure aggregation for the Reports screen.

export interface PeriodReport {
  days: string[];
  income: number;
  budget: number;
  otherIncome: number;
  borrowed: number;
  repaid: number;
  spent: number; // all expenses, including what was paid from reserves
  reserved: number; // the part of `spent` paid from reserves
  saved: number; // into goals minus out of goals (excluding loan movements)
  need: number;
  want: number;
  daily: { day: string; spent: number }[];
  weekly: { weekStart: string; income: number; spent: number }[];
  categories: ReturnType<typeof categoryTotals>;
  incomeCategories: ReturnType<typeof categoryTotals>;
  top: Tx[];
  savingsCurve: { day: string; total: number }[];
  avgPerDay: number;
  activeDays: number;
}

export function buildReport(allTxs: Tx[], cats: CatIndex, days: string[]): PeriodReport {
  const first = days[0];
  const last = days[days.length - 1];
  const inRange = allTxs.filter((t) => !t.deletedAt && t.day >= first && t.day <= last);
  const r = { income: 0, budget: 0, otherIncome: 0, borrowed: 0, repaid: 0, spent: 0, reserved: 0, saved: 0, need: 0, want: 0 };
  const dailyMap = new Map(days.map((d) => [d, { day: d, spent: 0 }]));
  const weekMap = new Map<string, { weekStart: string; income: number; spent: number }>();
  for (const d of days) {
    const ws = weekStartOf(d);
    if (!weekMap.has(ws)) weekMap.set(ws, { weekStart: ws, income: 0, spent: 0 });
  }

  for (const t of inRange) {
    const wk = weekMap.get(weekStartOf(t.day));
    if (t.type === "income") {
      r.income += t.amount;
      if (catKey(t, cats) === "budget") r.budget += t.amount;
      else r.otherIncome += t.amount;
      if (wk) wk.income += t.amount;
    } else if (t.type === "expense") {
      r.spent += t.amount;
      if (t.reserveId) r.reserved += t.amount;
      else dailyMap.get(t.day)!.spent += t.amount;
      if (t.needWant === "want") r.want += t.amount;
      else r.need += t.amount;
      if (wk) wk.spent += t.amount;
    } else if (t.type === "loan_taken") r.borrowed += t.amount;
    else if (t.type === "loan_repaid") r.repaid += t.amount;
    else if (t.type === "saving" && !t.loanId) r.saved += t.amount;
    else if (t.type === "saving_withdraw" && !t.loanId) r.saved -= t.amount;
  }

  // Savings curve: running goal balance at the end of each day in the range (all-time history counts).
  let running = 0;
  for (const t of allTxs) {
    if (t.deletedAt || t.day >= first) continue;
    if (t.type === "saving") running += t.amount;
    if (t.type === "saving_withdraw") running -= t.amount;
  }
  const perDaySave = new Map<string, number>();
  for (const t of inRange) {
    if (t.type === "saving") perDaySave.set(t.day, (perDaySave.get(t.day) ?? 0) + t.amount);
    if (t.type === "saving_withdraw") perDaySave.set(t.day, (perDaySave.get(t.day) ?? 0) - t.amount);
  }
  const savingsCurve = days.map((d) => {
    running += perDaySave.get(d) ?? 0;
    return { day: d, total: running };
  });

  const activeDays = new Set(inRange.filter((t) => t.type === "expense").map((t) => t.day)).size;
  return {
    days,
    ...r,
    daily: [...dailyMap.values()],
    weekly: [...weekMap.values()],
    categories: categoryTotals(inRange, cats),
    incomeCategories: categoryTotals(inRange, cats, { type: "income" }),
    top: inRange.filter((t) => t.type === "expense").sort((a, b) => b.amount - a.amount).slice(0, 5),
    savingsCurve,
    avgPerDay: activeDays ? Math.round((r.spent - r.reserved) / activeDays) : 0,
    activeDays,
  };
}

export function monthRange(month: string) {
  return monthDays(month);
}

export function toCSV(txs: Tx[], label: (t: Tx) => string, cats: CatIndex, wallets: Map<string, string>, currency: string): string {
  const head = ["date", "type", "title", "category", "amount", "currency", "wallet", "need_want", "one_off", "note"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = txs
    .filter((t) => !t.deletedAt)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1))
    .map((t) =>
      [t.day, t.type, label(t), t.categoryId ? cats.get(t.categoryId)?.name : "", t.amount / 100, currency, t.walletId ? wallets.get(t.walletId) : "", t.needWant, t.isOneOff ? "yes" : "", t.note ?? ""]
        .map(esc)
        .join(","),
    );
  return [head.join(","), ...rows].join("\n");
}
