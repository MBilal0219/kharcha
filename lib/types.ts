// Shared record shapes. Every synced record has id/updatedAt/deletedAt.
// On the phone they also carry `dirty` (1 = not synced yet); on the server `userId` + `syncedAt`.
// Money is always an integer number of hundredths (see lib/money.ts), whatever the currency.

export type TxType =
  | "expense"
  | "income"
  | "loan_taken" // borrowed cash comes in
  | "loan_repaid" // you pay a lender back
  | "loan_given" // you lend cash out
  | "loan_collected" // a borrower pays you back
  | "saving" // move money into a goal (virtual jar)
  | "saving_withdraw" // take money out of a goal
  | "transfer"; // between wallets

export type NeedWant = "need" | "want";

export interface SyncMeta {
  id: string;
  updatedAt: string; // ISO
  deletedAt: string | null;
}

export interface Tx extends SyncMeta {
  type: TxType;
  amount: number;
  walletId?: string;
  toWalletId?: string;
  categoryId?: string;
  loanId?: string;
  goalId?: string;
  reserveId?: string; // an expense paid out of a set-aside amount (not counted as daily spending), or a saving that meets a saving target
  needWant: NeedWant;
  isOneOff: boolean;
  note?: string;
  occurredAt: string; // ISO
  day: string; // yyyy-MM-dd in user's timezone
}

export interface Wallet extends SyncMeta {
  name: string;
  isDefault: boolean;
  sort: number;
}

/** Categories the app's logic depends on. Everything else is just a name the user can change. */
export type CategoryKey = "budget" | "found" | "unaccounted";

export interface Category extends SyncMeta {
  key?: CategoryKey | string; // system categories keep a stable key; custom ones get a uuid-ish key
  name: string;
  kind: "expense" | "income";
  icon: string; // lucide icon name
  limit?: number | null; // spending limit per budget period
  archived: boolean;
  sort: number;
}

export interface Person extends SyncMeta {
  name: string;
}

export interface Loan extends SyncMeta {
  personId: string | null; // null = borrowed from own savings
  direction: "borrowed" | "lent";
  principal: number;
  dueDate?: string | null; // yyyy-MM-dd
  goalId?: string | null; // when borrowed from savings
  status: "open" | "closed";
  note?: string;
  createdDay: string;
}

export interface Goal extends SyncMeta {
  name: string;
  target: number;
  kind: "buffer" | "goal";
  targetDate?: string | null;
  sort: number;
}

export interface Template extends SyncMeta {
  label: string;
  amount: number;
  type: "expense" | "income";
  categoryId: string;
  walletId?: string;
  needWant: NeedWant;
  sort: number;
}

export interface Settings extends SyncMeta {
  currency: string; // ISO 4217 code
  budgetAmount: number; // what usually comes in each budget period
  timezone: string;
  reminderHour: number;
  extraSavePercent: number; // suggested share of extra income (anything but the budget itself) to save
  bufferTarget: number;
  onboarded: boolean;
}

export type PeriodKind = "weekly" | "biweekly" | "monthly";

/**
 * How the budget is laid out in time, from `from` onwards. A change is a new row with a later `from`,
 * so earlier days keep the schedule they had (see lib/budget/period.ts).
 */
export interface Schedule extends SyncMeta {
  from: string; // yyyy-MM-dd, first day this row applies
  period: PeriodKind;
  startDow: number; // weekly / biweekly: first day of the period, Monday = 0 … Sunday = 6
  startDom: number; // monthly: day of the month the period starts on (1–28)
  offDays: number[]; // days of the week with no planned spending, Monday = 0
}

/**
 * Money set aside from the budget so the daily figure never counts it: something to pay (the fare home,
 * a gift this weekend) or an amount to save. It is held back until it is paid or saved, or released.
 * One that applies to a single period has `until` set to that period's last day.
 */
export interface Reserve extends SyncMeta {
  name: string;
  kind: "spend" | "save";
  amounts: { from: string; amount: number }[]; // amount history; the entry in force at a period's end applies to it
  until: string | null; // last day it applied, once removed
  sort: number;
}

export interface PeriodSetting extends SyncMeta {
  periodStart: string;
  carryIn: number; // leftover carried from the previous period
  sweptPrev: boolean; // previous period's leftover handled (saved or carried)
  reservesOff: string[]; // reserves released for this period
}

/** One-off change to a single date: a holiday (off) or an extra working day (work). */
export interface DayOverride extends SyncMeta {
  day: string;
  kind: "off" | "work";
}

export interface DayClosure extends SyncMeta {
  day: string;
}

export interface CashCount extends SyncMeta {
  walletId: string;
  counted: number;
  expected: number;
  countedAt: string;
}

export const SYNC_TABLES = [
  "transactions",
  "wallets",
  "categories",
  "people",
  "loans",
  "goals",
  "templates",
  "settings",
  "schedules",
  "reserves",
  "periodSettings",
  "dayOverrides",
  "dayClosures",
  "cashCounts",
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export interface TableRecordMap {
  transactions: Tx;
  wallets: Wallet;
  categories: Category;
  people: Person;
  loans: Loan;
  goals: Goal;
  templates: Template;
  settings: Settings;
  schedules: Schedule;
  reserves: Reserve;
  periodSettings: PeriodSetting;
  dayOverrides: DayOverride;
  dayClosures: DayClosure;
  cashCounts: CashCount;
}

export const DEFAULT_SETTINGS = {
  currency: "USD",
  budgetAmount: 0,
  timezone: "UTC",
  reminderHour: 22,
  extraSavePercent: 50,
  bufferTarget: 0,
  onboarded: false,
};
