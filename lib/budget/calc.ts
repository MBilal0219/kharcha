import type { Category, Goal, Loan, PeriodSetting, Reserve, Tx, Wallet } from "@/lib/types";
import { reserveAmountFor, type Period } from "./period";
import { addDay } from "./week";

// Pure budget math. No Date.now(), no IO — callers pass `today`.

export type CatIndex = Map<string, Category>;

export function indexCategories(cats: Category[]): CatIndex {
  return new Map(cats.map((c) => [c.id, c]));
}

export function catKey(tx: Tx, cats: CatIndex): string | undefined {
  return tx.categoryId ? cats.get(tx.categoryId)?.key : undefined;
}

const live = (t: { deletedAt: string | null }) => !t.deletedAt;

export interface ReserveState {
  reserve: Reserve;
  amount: number;
  spent: number; // paid out of it, or saved towards it
  locked: number; // still held back from the budget
  leftover: number; // for something to pay: the amount minus what it actually cost
  off: boolean; // released for this period
}

export interface PeriodSummary {
  start: string;
  end: string;
  today: string;
  budgetIn: number;
  otherIncome: number;
  loansTaken: number;
  loansCollected: number;
  savingWithdrawn: number;
  carryIn: number;
  moneyIn: number;

  spent: number; // expenses, excluding what was paid out of a reserve
  reserveSpent: number;
  reserveLocked: number; // actually held back: never more than the money that is there
  reserveShort: number; // set aside but not covered yet, because not enough has come in
  reserveLeftover: number;
  reserves: ReserveState[];
  saved: number;
  loansRepaid: number;
  loansGiven: number;

  spendable: number; // what is still free to spend this period
  periodBudget: number; // spendable + already spent
  spentToday: number;
  dailyLimit: number;
  leftToday: number;
  daysLeft: number; // working days left, today included
  workDays: number; // working days in the whole period
  perDay: number; // the period's budget split evenly over its working days
  isOffToday: boolean;
  weekSafe: number; // today's limit kept up for the working days left in the next 7 days
  pace: "none" | "good" | "watch" | "over";
  plannedByNow: number;
  spentBeforeToday: number;
  runOutDay: string | null;

  budgetLogged: boolean;
  needSpent: number;
  wantSpent: number;
  dailySpend: { day: string; amount: number; income: number; off: boolean }[]; // amount = spent that day; income = budget and other money in
}

/**
 * Everything the home screen shows for one budget period.
 * The daily limit is "money still free ÷ working days left", so it follows whatever schedule `isWork` reflects.
 */
export function summarizePeriod(args: {
  txs: Tx[]; // any range; filtered to the period here
  cats: CatIndex;
  period: Period;
  reserves: Reserve[];
  setting?: Pick<PeriodSetting, "carryIn" | "reservesOff"> | null;
  today: string;
  isWork: (day: string) => boolean;
}): PeriodSummary {
  const { cats, period, today, isWork } = args;
  const txs = args.txs.filter((t) => live(t) && t.day >= period.start && t.day <= period.end);
  const carryIn = Math.max(0, args.setting?.carryIn ?? 0);
  const released = new Set(args.setting?.reservesOff ?? []);

  const s = {
    budgetIn: 0,
    otherIncome: 0,
    loansTaken: 0,
    loansCollected: 0,
    savingWithdrawn: 0,
    spent: 0,
    reserveSpent: 0,
    saved: 0,
    loansRepaid: 0,
    loansGiven: 0,
    spentToday: 0,
    needSpent: 0,
    wantSpent: 0,
  };
  const perDay = new Map(period.days.map((d) => [d, 0]));
  const inPerDay = new Map<string, number>();
  const byReserve = new Map<string, number>();

  for (const t of txs) {
    switch (t.type) {
      case "income":
        inPerDay.set(t.day, (inPerDay.get(t.day) ?? 0) + t.amount);
        if (catKey(t, cats) === "budget") s.budgetIn += t.amount;
        else s.otherIncome += t.amount;
        break;
      case "expense":
        if (t.reserveId) {
          s.reserveSpent += t.amount;
          byReserve.set(t.reserveId, (byReserve.get(t.reserveId) ?? 0) + t.amount);
          break;
        }
        s.spent += t.amount;
        if (t.needWant === "want") s.wantSpent += t.amount;
        else s.needSpent += t.amount;
        if (t.day === today) s.spentToday += t.amount;
        perDay.set(t.day, (perDay.get(t.day) ?? 0) + t.amount);
        break;
      case "loan_taken":
        s.loansTaken += t.amount;
        break;
      case "loan_collected":
        s.loansCollected += t.amount;
        break;
      case "saving_withdraw":
        s.savingWithdrawn += t.amount;
        break;
      case "saving":
        s.saved += t.amount;
        if (t.reserveId) byReserve.set(t.reserveId, (byReserve.get(t.reserveId) ?? 0) + t.amount);
        break;
      case "loan_repaid":
        s.loansRepaid += t.amount;
        break;
      case "loan_given":
        s.loansGiven += t.amount;
        break;
      case "transfer":
        break;
    }
  }

  // A set-aside amount stays locked until it is paid (or saved), or it is released for the period.
  const reserves: ReserveState[] = [];
  for (const reserve of args.reserves.filter(live).sort((x, y) => x.sort - y.sort)) {
    const amount = reserveAmountFor(reserve, period);
    if (amount === null) continue;
    const spent = byReserve.get(reserve.id) ?? 0;
    const off = released.has(reserve.id);
    reserves.push({
      reserve,
      amount,
      spent,
      off,
      locked: !off && spent === 0 ? amount : 0,
      leftover: reserve.kind === "spend" && spent > 0 ? Math.max(amount - spent, 0) : 0,
    });
  }
  const reserveLeftover = reserves.reduce((a, r) => a + r.leftover, 0);

  const moneyIn = s.budgetIn + s.otherIncome + s.loansTaken + s.loansCollected + s.savingWithdrawn + carryIn;
  const out = s.spent + s.reserveSpent + s.saved + s.loansRepaid + s.loansGiven;
  // Setting money aside can't put you in the red by itself: it holds back what is there, and the rest is "short".
  const wanted = reserves.reduce((a, r) => a + r.locked, 0);
  const reserveLocked = Math.min(wanted, Math.max(moneyIn - out, 0));
  const reserveShort = wanted - reserveLocked;
  const spendable = moneyIn - out - reserveLocked;

  const isCurrent = today >= period.start && today <= period.end;
  const work = period.days.filter(isWork);
  const workDays = Math.max(work.length, 1);
  const workLeft = isCurrent ? work.filter((d) => d >= today) : [];
  const daysLeft = Math.max(workLeft.length, 1);
  const elapsed = isCurrent ? work.filter((d) => d < today).length : workDays;
  const isOffToday = isCurrent && !isWork(today);

  const available = spendable + s.spentToday; // money available at the start of today
  const dailyLimit = isCurrent ? Math.floor(Math.max(available, 0) / daysLeft) : 0;
  const leftToday = dailyLimit - s.spentToday;
  const weekEnd = addDay(today, 6);
  const weekSafe = dailyLimit * workLeft.filter((d) => d <= weekEnd).length;

  const periodBudget = spendable + s.spent;
  const spentBeforeToday = s.spent - s.spentToday;
  const plannedByNow = Math.round((Math.max(periodBudget, 0) * elapsed) / workDays);

  let pace: PeriodSummary["pace"] = "none";
  if (periodBudget > 0 && isCurrent) {
    const ratio = plannedByNow > 0 ? spentBeforeToday / plannedByNow : 0;
    if (spendable < 0 || leftToday < 0 || ratio > 1.15) pace = "over";
    else if (ratio > 1 || (dailyLimit > 0 && leftToday < dailyLimit * 0.2)) pace = "watch";
    else pace = "good";
  }

  let runOutDay: string | null = null;
  if (isCurrent && elapsed > 0 && spentBeforeToday > 0) {
    const avg = spentBeforeToday / elapsed;
    const coverDays = Math.floor(Math.max(available, 0) / avg);
    if (coverDays < workLeft.length) runOutDay = workLeft[coverDays];
  }

  return {
    start: period.start,
    end: period.end,
    today,
    ...s,
    carryIn,
    moneyIn,
    reserveLocked,
    reserveShort,
    reserveLeftover,
    reserves,
    spendable,
    periodBudget,
    dailyLimit,
    leftToday,
    daysLeft,
    workDays,
    perDay: Math.round(Math.max(periodBudget, 0) / workDays),
    isOffToday,
    weekSafe,
    pace,
    plannedByNow,
    spentBeforeToday,
    runOutDay,
    budgetLogged: s.budgetIn > 0,
    dailySpend: period.days.map((d) => ({ day: d, amount: perDay.get(d) ?? 0, income: inPerDay.get(d) ?? 0, off: !isWork(d) })),
  };
}

/**
 * The period's money in parts that add up: left + spent + saved + setAside + lent − over = total.
 * `setAside` is what is still held plus what was paid out of it; `over` is how far past zero the period is.
 */
export function moneySplit(s: PeriodSummary) {
  return {
    total: s.moneyIn,
    left: Math.max(s.spendable, 0),
    over: Math.max(-s.spendable, 0),
    spent: s.spent,
    saved: s.saved,
    setAside: s.reserveLocked + s.reserveSpent,
    lent: s.loansGiven + s.loansRepaid,
  };
}

/** Real money per wallet. Savings goals are virtual jars, so saving/withdraw don't move wallet money. */
export function walletBalances(txs: Tx[], wallets: Wallet[]): Map<string, number> {
  const bal = new Map<string, number>(wallets.map((w) => [w.id, 0]));
  const fallback = wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id;
  const add = (id: string | undefined, n: number) => {
    const k = id && bal.has(id) ? id : fallback;
    if (k) bal.set(k, (bal.get(k) ?? 0) + n);
  };
  for (const t of txs) {
    if (!live(t)) continue;
    switch (t.type) {
      case "income":
      case "loan_taken":
      case "loan_collected":
        add(t.walletId, t.amount);
        break;
      case "expense":
      case "loan_repaid":
      case "loan_given":
        add(t.walletId, -t.amount);
        break;
      case "transfer":
        add(t.walletId, -t.amount);
        add(t.toWalletId, t.amount);
        break;
    }
  }
  return bal;
}

export function goalBalances(txs: Tx[], goals: Goal[]): Map<string, number> {
  const bal = new Map<string, number>(goals.map((g) => [g.id, 0]));
  for (const t of txs) {
    if (!live(t) || !t.goalId) continue;
    if (t.type === "saving") bal.set(t.goalId, (bal.get(t.goalId) ?? 0) + t.amount);
    if (t.type === "saving_withdraw") bal.set(t.goalId, (bal.get(t.goalId) ?? 0) - t.amount);
  }
  return bal;
}

export interface LoanState {
  loan: Loan;
  paid: number;
  outstanding: number;
}

/** Repayments: loan_repaid (to a person), saving (back into your own savings), loan_collected (lent money returning). */
export function loanStates(loans: Loan[], txs: Tx[]): LoanState[] {
  const paid = new Map<string, number>();
  for (const t of txs) {
    if (!live(t) || !t.loanId) continue;
    if (t.type === "loan_repaid" || t.type === "loan_collected" || t.type === "saving") {
      paid.set(t.loanId, (paid.get(t.loanId) ?? 0) + t.amount);
    }
  }
  return loans
    .filter(live)
    .map((loan) => {
      const p = paid.get(loan.id) ?? 0;
      return { loan, paid: p, outstanding: Math.max(loan.principal - p, 0) };
    });
}

export function totalOwed(states: LoanState[]): number {
  return states
    .filter((s) => s.loan.direction === "borrowed" && s.loan.status === "open")
    .reduce((a, s) => a + s.outstanding, 0);
}

export function totalOwedToYou(states: LoanState[]): number {
  return states
    .filter((s) => s.loan.direction === "lent" && s.loan.status === "open")
    .reduce((a, s) => a + s.outstanding, 0);
}

/** "Debt-free by": weeks needed if you repay at your recent weekly repayment pace. */
export function weeksToDebtFree(owed: number, weeklyRepay: number): number | null {
  if (owed <= 0) return 0;
  if (weeklyRepay <= 0) return null;
  return Math.ceil(owed / weeklyRepay);
}

export function categoryTotals(txs: Tx[], cats: CatIndex, opts: { excludeReserved?: boolean; type?: "expense" | "income" } = {}) {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (!live(t) || t.type !== (opts.type ?? "expense")) continue;
    if (opts.excludeReserved && t.reserveId) continue;
    const id = t.categoryId ?? "none";
    map.set(id, (map.get(id) ?? 0) + t.amount);
  }
  return [...map.entries()]
    .map(([categoryId, total]) => ({ categoryId, total, category: cats.get(categoryId) }))
    .sort((a, b) => b.total - a.total);
}

/** Consecutive days (ending today, or yesterday if today isn't logged yet) with an entry or a closure. */
export function loggingStreak(activeDays: Set<string>, today: string): number {
  let d = activeDays.has(today) ? today : addDay(today, -1);
  let n = 0;
  while (activeDays.has(d)) {
    n++;
    d = addDay(d, -1);
  }
  return n;
}
