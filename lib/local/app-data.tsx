"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb, type CachedUser } from "./db";
import type { SyncState } from "./sync";
import {
  goalBalances, indexCategories, loanStates, loggingStreak, summarizePeriod, totalOwed, totalOwedToYou, walletBalances,
  type CatIndex, type LoanState, type PeriodSummary,
} from "@/lib/budget/calc";
import { buildInsights, type Insight } from "@/lib/budget/insights";
import { isWorkDay, periodOf, scheduleAt, sortSchedules, type Overrides, type Period, type ScheduleLike } from "@/lib/budget/period";
import { addDay, localDay, localHour, DEFAULT_TZ } from "@/lib/budget/week";
import { setCurrency } from "@/lib/money";
import {
  DEFAULT_SETTINGS, SYNC_TABLES,
  type CashCount, type Category, type Goal, type Loan, type Person, type PeriodSetting, type Reserve, type Schedule, type Settings, type Template, type Tx, type Wallet,
} from "@/lib/types";

type WithDirty<T> = T & { dirty: 0 | 1 };

export interface AppData {
  ready: boolean;
  user: CachedUser | null;
  sync: SyncState;
  pending: number;
  settings: Settings;
  tz: string;
  now: Date;
  today: string;
  hour: number;
  schedules: Schedule[]; // oldest first
  schedule: ScheduleLike; // in force today
  overrides: Overrides;
  period: Period; // the budget period today falls in
  prevPeriod: Period;
  isWork: (day: string) => boolean;

  txs: WithDirty<Tx>[]; // live (not deleted), newest first
  wallets: Wallet[];
  categories: Category[];
  cats: CatIndex;
  people: Person[];
  peopleById: Map<string, Person>;
  loans: Loan[];
  goals: Goal[];
  templates: Template[];
  reserves: Reserve[]; // still in use
  allReserves: Reserve[];
  periodSettings: Map<string, PeriodSetting>;
  periodTxs: WithDirty<Tx>[]; // entries in the current period
  closures: Set<string>;
  cashCounts: CashCount[];

  sum: PeriodSummary;
  prevSum: PeriodSummary;
  walletBal: Map<string, number>;
  goalBal: Map<string, number>;
  loanStates: LoanState[];
  owed: number;
  owedToYou: number;
  savedTotal: number;
  streak: number;
  insights: Insight[];
  loggedToday: boolean;
  hasSettings: boolean;
}

const Ctx = createContext<AppData | null>(null);

function useClock(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    const onVis = () => document.visibilityState === "visible" && setNow(new Date());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs]);
  return now;
}

const live = <T extends { deletedAt: string | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt);
const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const raw = useLiveQuery(async () => {
    const [transactions, wallets, categories, people, loans, goals, templates, settings, schedules, reserves, periodSettings, dayOverrides, dayClosures, cashCounts, meta] =
      await Promise.all([
        localDb.transactions.toArray(),
        localDb.wallets.toArray(),
        localDb.categories.toArray(),
        localDb.people.toArray(),
        localDb.loans.toArray(),
        localDb.goals.toArray(),
        localDb.templates.toArray(),
        localDb.settings.toArray(),
        localDb.schedules.toArray(),
        localDb.reserves.toArray(),
        localDb.periodSettings.toArray(),
        localDb.dayOverrides.toArray(),
        localDb.dayClosures.toArray(),
        localDb.cashCounts.toArray(),
        localDb.meta.toArray(),
      ]);
    let pending = 0;
    for (const t of SYNC_TABLES) pending += await localDb.tableFor(t).where("dirty").equals(1).count();
    const m = new Map(meta.map((r) => [r.key, r.value]));
    return { transactions, wallets, categories, people, loans, goals, templates, settings, schedules, reserves, periodSettings, dayOverrides, dayClosures, cashCounts, m, pending };
  }, []);

  const now = useClock();

  const value = useMemo<AppData | null>(() => {
    if (!raw) return null;
    const settingsRow = live(raw.settings)[0];
    const settings: Settings = settingsRow ?? { id: "local", updatedAt: "", deletedAt: null, ...DEFAULT_SETTINGS };
    // Until setup stores the user's own zone, read days in the device's zone.
    const tz = settings.onboarded ? settings.timezone || DEFAULT_TZ : Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
    const today = localDay(now, tz);
    setCurrency(settings.currency); // before anything below formats money

    const schedules = sortSchedules(live(raw.schedules));
    const overrides: Overrides = new Map(live(raw.dayOverrides).map((o) => [o.day, o.kind]));
    const isWork = (day: string) => isWorkDay(day, schedules, overrides);
    const period = periodOf(today, schedules);
    const prevPeriod = periodOf(addDay(period.start, -1), schedules);

    const txs = live(raw.transactions).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
    const categories = live(raw.categories).sort(bySort);
    const cats = indexCategories(categories);
    const wallets = live(raw.wallets).sort(bySort);
    const goals = live(raw.goals).sort(bySort);
    const loans = live(raw.loans);
    const people = live(raw.people).sort((a, b) => a.name.localeCompare(b.name));
    const periodSettings = new Map(live(raw.periodSettings).map((w) => [w.periodStart, w]));
    const allReserves = live(raw.reserves).sort(bySort);
    const closures = new Set(live(raw.dayClosures).map((d) => d.day));

    const sum = summarizePeriod({ txs, cats, period, reserves: allReserves, setting: periodSettings.get(period.start), today, isWork });
    const prevSum = summarizePeriod({ txs, cats, period: prevPeriod, reserves: allReserves, setting: periodSettings.get(prevPeriod.start), today, isWork });
    const periodTxs = txs.filter((t) => t.day >= period.start && t.day <= period.end);
    const states = loanStates(loans, txs);
    const owed = totalOwed(states);
    const goalBal = goalBalances(txs, goals);
    const activeDays = new Set<string>([...txs.map((t) => t.day), ...closures]);
    const streak = loggingStreak(activeDays, today);

    const insights = buildInsights({
      sum,
      prevSum,
      periodTxs,
      prevTxs: txs.filter((t) => t.day >= prevPeriod.start && t.day <= prevPeriod.end),
      kind: period.kind,
      cats,
      owed,
      streak,
    });

    return {
      ready: true,
      user: (raw.m.get("user") as CachedUser) ?? null,
      sync: (raw.m.get("sync") as SyncState) ?? { status: "idle", lastSyncedAt: null },
      pending: raw.pending,
      settings,
      tz,
      now,
      today,
      hour: localHour(now, tz),
      schedules,
      schedule: scheduleAt(today, schedules),
      overrides,
      period,
      prevPeriod,
      isWork,
      txs,
      wallets,
      categories,
      cats,
      people,
      peopleById: new Map(people.map((p) => [p.id, p])),
      loans,
      goals,
      templates: live(raw.templates).sort(bySort),
      reserves: allReserves.filter((r) => !r.until || r.until >= today),
      allReserves,
      periodSettings,
      periodTxs,
      closures,
      cashCounts: live(raw.cashCounts).sort((a, b) => (a.countedAt < b.countedAt ? 1 : -1)),
      sum,
      prevSum,
      walletBal: walletBalances(txs, wallets),
      goalBal,
      loanStates: states,
      owed,
      owedToYou: totalOwedToYou(states),
      savedTotal: [...goalBal.values()].reduce((a, b) => a + b, 0),
      streak,
      insights,
      loggedToday: activeDays.has(today),
      hasSettings: Boolean(settingsRow),
    };
  }, [raw, now]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData used before data loaded");
  return v;
}

export function useMaybeAppData(): AppData | null {
  return useContext(Ctx);
}
