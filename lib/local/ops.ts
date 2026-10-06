import { localDb, getMeta, type CachedUser, type Local } from "./db";
import { requestSync } from "./sync";
import { addDay, localDay, localDateTimeToISO, localTime, DEFAULT_TZ } from "@/lib/budget/week";
import type { ScheduleLike } from "@/lib/budget/period";
import type {
  Category, CashCount, DayOverride, Goal, Loan, NeedWant, Person, PeriodSetting, Reserve, Settings, SyncTable, TableRecordMap, Template, Tx, TxType, Wallet,
} from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { LoanState } from "@/lib/budget/calc";

// Every write to user data goes through here: stamp updatedAt, mark dirty, then ask for a sync.

const uuid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();

async function tz(): Promise<string> {
  const s = await localDb.settings.toCollection().first();
  return s?.timezone ?? DEFAULT_TZ;
}

async function userId(): Promise<string> {
  const u = await getMeta<CachedUser>("user");
  if (!u) throw new Error("Not signed in on this device");
  return u.id;
}

export async function save<T extends SyncTable>(table: T, rec: Omit<TableRecordMap[T], "updatedAt" | "deletedAt"> & { deletedAt?: string | null }) {
  const row = { deletedAt: null, ...rec, updatedAt: nowISO(), dirty: 1 } as unknown as Local<TableRecordMap[T]>;
  await localDb.tableFor(table).put(row);
  requestSync();
  return row;
}

export async function patch<T extends SyncTable>(table: T, id: string, changes: Partial<TableRecordMap[T]>) {
  const cur = await localDb.tableFor(table).get(id);
  if (!cur) return;
  const { dirty: _d, ...rest } = cur;
  return save(table, { ...(rest as unknown as TableRecordMap[T]), ...changes });
}

export async function remove(table: SyncTable, id: string) {
  return patch(table, id, { deletedAt: nowISO() } as never);
}

/** Tombstoned rows come back by clearing deletedAt (used by Undo). */
export async function restore(table: SyncTable, id: string) {
  return patch(table, id, { deletedAt: null } as never);
}

// ---------- transactions ----------

export interface TxInput {
  type: TxType;
  amount: number;
  day?: string; // defaults to today
  categoryId?: string;
  walletId?: string;
  toWalletId?: string;
  loanId?: string;
  goalId?: string;
  reserveId?: string;
  needWant?: NeedWant;
  isOneOff?: boolean;
  note?: string;
}

export async function addTx(input: TxInput): Promise<Tx> {
  const zone = await tz();
  const now = new Date();
  const today = localDay(now, zone);
  const day = input.day ?? today;
  const occurredAt = day === today ? now.toISOString() : localDateTimeToISO(day, localTime(now, zone), zone);
  const walletId = input.walletId ?? (await defaultWalletId());
  const { day: _d, ...rest } = input;
  return save("transactions", {
    id: uuid(),
    needWant: "need",
    isOneOff: false,
    ...rest,
    walletId,
    occurredAt,
    day,
  });
}

export async function updateTx(id: string, changes: Partial<TxInput>) {
  const cur = await localDb.transactions.get(id);
  if (!cur) return;
  const next: Partial<Tx> = { ...changes };
  if (changes.day && changes.day !== cur.day) {
    const zone = await tz();
    next.occurredAt = localDateTimeToISO(changes.day, localTime(new Date(cur.occurredAt), zone), zone);
  }
  return patch("transactions", id, next);
}

async function defaultWalletId(): Promise<string | undefined> {
  const ws = (await localDb.wallets.toArray()).filter((w) => !w.deletedAt);
  return (ws.find((w) => w.isDefault) ?? ws[0])?.id;
}

// ---------- people & loans ----------

/** Names are unique per account (ignoring case), so the same person is never tracked twice. */
export async function addPerson(name: string): Promise<Person> {
  const clean = name.trim().replace(/s+/g, " ");
  const existing = (await localDb.people.toArray()).find((p) => !p.deletedAt && p.name.toLowerCase() === clean.toLowerCase());
  return existing ?? save("people", { id: uuid(), name: clean });
}

export async function createLoan(input: {
  direction: "borrowed" | "lent";
  amount: number;
  personId: string | null;
  goalId?: string | null;
  dueDate?: string | null;
  walletId?: string;
  note?: string;
  day?: string;
}) {
  const day = input.day ?? localDay(new Date(), await tz());
  const loan = await save("loans", {
    id: uuid(),
    personId: input.personId,
    direction: input.direction,
    principal: input.amount,
    dueDate: input.dueDate ?? null,
    goalId: input.goalId ?? null,
    status: "open",
    note: input.note,
    createdDay: day,
  });
  if (input.personId === null && input.goalId) {
    // Borrowing from your own savings: money leaves the jar, you owe it back.
    await addTx({ type: "saving_withdraw", amount: input.amount, goalId: input.goalId, loanId: loan.id, day, note: "Borrowed from savings" });
  } else {
    await addTx({
      type: input.direction === "borrowed" ? "loan_taken" : "loan_given",
      amount: input.amount,
      loanId: loan.id,
      walletId: input.walletId,
      day,
      note: input.note,
    });
  }
  return loan;
}

export async function repayLoan(state: LoanState, amount: number, walletId?: string) {
  const { loan } = state;
  const pay = Math.min(amount, state.outstanding);
  if (pay <= 0) return;
  if (loan.personId === null && loan.goalId) {
    await addTx({ type: "saving", amount: pay, goalId: loan.goalId, loanId: loan.id, note: "Paid back to savings" });
  } else {
    await addTx({ type: loan.direction === "borrowed" ? "loan_repaid" : "loan_collected", amount: pay, loanId: loan.id, walletId });
  }
  if (pay >= state.outstanding) await patch("loans", loan.id, { status: "closed" });
}

// ---------- savings ----------

/** `reserveId` marks the saving as meeting that saving target, so the target stops holding money back. */
export async function moveToGoal(goalId: string, amount: number, note?: string, day?: string, reserveId?: string) {
  return addTx({ type: "saving", amount, goalId, note, day, reserveId });
}
export async function withdrawFromGoal(goalId: string, amount: number, note?: string) {
  return addTx({ type: "saving_withdraw", amount, goalId, note });
}

// ---------- day / week ----------

export async function closeDay(day: string) {
  const id = `${await userId()}:${day}`;
  return save("dayClosures", { id, day });
}

export async function setPeriod(periodStart: string, changes: Partial<Pick<PeriodSetting, "carryIn" | "sweptPrev" | "reservesOff">>) {
  const id = `${await userId()}:${periodStart}`;
  const cur = await localDb.periodSettings.get(id);
  return save("periodSettings", {
    id,
    periodStart,
    carryIn: cur?.carryIn ?? 0,
    sweptPrev: cur?.sweptPrev ?? false,
    reservesOff: cur?.reservesOff ?? [],
    ...changes,
  });
}

/** A schedule change is a new row from `from` onwards; earlier days keep the schedule they had. */
export async function saveSchedule(input: ScheduleLike) {
  const same = (await localDb.schedules.toArray()).find((r) => !r.deletedAt && r.from === input.from);
  return save("schedules", { id: same?.id ?? uuid(), ...input, offDays: [...new Set(input.offDays)].sort() });
}

/** Marks one date as a day off or a working day; null puts it back on the normal schedule. */
export async function setDayOverride(day: string, kind: DayOverride["kind"] | null) {
  const id = `${await userId()}:${day}`;
  if (kind === null) return remove("dayOverrides", id);
  return save("dayOverrides", { id, day, kind });
}

/**
 * Adds or edits a set-aside amount. A new amount applies from today's period on; periods that already
 * ended keep the amount they had. `onlyUntil` (a period's last day) makes a new one apply to that period only.
 */
export async function upsertReserve(r: { id?: string; name: string; amount: number; kind?: Reserve["kind"]; onlyUntil?: string | null }) {
  const today = localDay(new Date(), await tz());
  const cur = r.id ? await localDb.reserves.get(r.id) : undefined;
  if (!cur) {
    const sort = await localDb.reserves.count();
    return save("reserves", { id: uuid(), name: r.name, kind: r.kind ?? "spend", amounts: [{ from: today, amount: r.amount }], until: r.onlyUntil ?? null, sort });
  }
  const last = [...cur.amounts].sort((x, y) => (x.from < y.from ? -1 : 1)).at(-1);
  const amounts = last?.amount === r.amount ? cur.amounts : [...cur.amounts.filter((x) => x.from !== today), { from: today, amount: r.amount }];
  return patch("reserves", cur.id, { name: r.name, amounts } as Partial<Reserve>);
}

/** Stops a reserve from today's period on. Its history stays. */
export async function endReserve(id: string) {
  return patch("reserves", id, { until: addDay(localDay(new Date(), await tz()), -1) } as Partial<Reserve>);
}

export async function recordCashCount(walletId: string, counted: number, expected: number): Promise<CashCount> {
  return save("cashCounts", { id: uuid(), walletId, counted, expected, countedAt: nowISO() });
}

// ---------- settings & lists ----------

export async function updateSettings(changes: Partial<Settings>) {
  const cur = await localDb.settings.toCollection().first();
  const id = cur?.id ?? `settings:${await userId()}`;
  const base = cur ? (({ dirty: _d, ...r }) => r)(cur) : { id, ...DEFAULT_SETTINGS };
  return save("settings", { ...base, ...changes, id } as Settings);
}

export async function upsertCategory(c: Partial<Category> & Pick<Category, "name" | "kind">) {
  const id = c.id ?? uuid();
  const cur = c.id ? await localDb.categories.get(c.id) : undefined;
  return save("categories", {
    icon: "dots",
    archived: false,
    sort: 99,
    limit: null,
    key: cur?.key ?? `custom-${id.slice(0, 8)}`,
    ...(cur ? (({ dirty: _d, ...r }) => r)(cur) : {}),
    ...c,
    id,
  } as Category);
}

export async function upsertTemplate(t: Omit<Template, "updatedAt" | "deletedAt" | "id"> & { id?: string }) {
  return save("templates", { ...t, id: t.id ?? uuid() });
}

export async function upsertWallet(w: Partial<Wallet> & Pick<Wallet, "name">) {
  const id = w.id ?? uuid();
  const cur = w.id ? await localDb.wallets.get(w.id) : undefined;
  return save("wallets", { isDefault: false, sort: 99, ...(cur ? (({ dirty: _d, ...r }) => r)(cur) : {}), ...w, id } as Wallet);
}

export async function setDefaultWallet(id: string) {
  const all = (await localDb.wallets.toArray()).filter((w) => !w.deletedAt);
  for (const w of all) if (w.isDefault !== (w.id === id)) await patch("wallets", w.id, { isDefault: w.id === id });
}

export async function upsertGoal(g: Partial<Goal> & Pick<Goal, "name" | "target">) {
  const id = g.id ?? uuid();
  const cur = g.id ? await localDb.goals.get(g.id) : undefined;
  return save("goals", { kind: "goal", targetDate: null, sort: 99, ...(cur ? (({ dirty: _d, ...r }) => r)(cur) : {}), ...g, id } as Goal);
}

export type { Loan, Template };
