import Dexie, { type Table } from "dexie";
import type { SyncTable, TableRecordMap } from "@/lib/types";

// The phone's database. The UI reads only from here; /api/sync keeps it in step with MongoDB.

export type Local<T> = T & { dirty: 0 | 1 };

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface CachedUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export class LocalDB extends Dexie {
  transactions!: Table<Local<TableRecordMap["transactions"]>, string>;
  wallets!: Table<Local<TableRecordMap["wallets"]>, string>;
  categories!: Table<Local<TableRecordMap["categories"]>, string>;
  people!: Table<Local<TableRecordMap["people"]>, string>;
  loans!: Table<Local<TableRecordMap["loans"]>, string>;
  goals!: Table<Local<TableRecordMap["goals"]>, string>;
  templates!: Table<Local<TableRecordMap["templates"]>, string>;
  settings!: Table<Local<TableRecordMap["settings"]>, string>;
  schedules!: Table<Local<TableRecordMap["schedules"]>, string>;
  reserves!: Table<Local<TableRecordMap["reserves"]>, string>;
  periodSettings!: Table<Local<TableRecordMap["periodSettings"]>, string>;
  dayOverrides!: Table<Local<TableRecordMap["dayOverrides"]>, string>;
  dayClosures!: Table<Local<TableRecordMap["dayClosures"]>, string>;
  cashCounts!: Table<Local<TableRecordMap["cashCounts"]>, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("kharcha");
    this.version(1).stores({
      transactions: "id, day, weekStart, type, categoryId, loanId, goalId, dirty, updatedAt",
      wallets: "id, dirty",
      categories: "id, kind, dirty",
      people: "id, dirty",
      loans: "id, status, dirty",
      goals: "id, dirty",
      templates: "id, sort, dirty",
      settings: "id, dirty",
      weekSettings: "id, weekStart, dirty",
      dayClosures: "id, day, dirty",
      cashCounts: "id, walletId, dirty",
      meta: "key",
    });
    // v2: money in hundredths, budget periods instead of fixed weeks, reserves. The old rows can't be read
    // the new way, so the phone's copy is emptied and pulled again from the server (or re-seeded in demo mode).
    this.version(2)
      .stores({
        transactions: "id, day, type, categoryId, loanId, goalId, dirty, updatedAt",
        weekSettings: null,
        schedules: "id, from, dirty",
        reserves: "id, dirty",
        periodSettings: "id, periodStart, dirty",
        dayOverrides: "id, day, dirty",
      })
      .upgrade((tx) => Promise.all(tx.storeNames.filter((n) => n !== "weekSettings").map((n) => tx.table(n).clear())));
  }

  tableFor<T extends SyncTable>(name: T): Table<Local<TableRecordMap[T]>, string> {
    return this.table(name) as Table<Local<TableRecordMap[T]>, string>;
  }
}

export const localDb = new LocalDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await localDb.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await localDb.meta.put({ key, value });
}
