import { localDb } from "./db";
import { requestSync } from "./sync";
import { SYNC_TABLES } from "@/lib/types";

/** Full JSON backup of everything on this phone. */
export async function exportBackup(): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const t of SYNC_TABLES) data[t] = (await localDb.tableFor(t).toArray()).map(({ dirty: _d, ...r }) => r);
  return JSON.stringify({ app: "kharcha", version: 1, exportedAt: new Date().toISOString(), data }, null, 1);
}

/** Merge a backup in; newer rows win. Imported rows are marked dirty so they reach the server. */
export async function importBackup(json: string): Promise<number> {
  const parsed = JSON.parse(json) as { app?: string; data?: Record<string, { id: string; updatedAt: string }[]> };
  if (parsed.app !== "kharcha" || !parsed.data) throw new Error("This isn't a Kharcha backup file.");
  let n = 0;
  await localDb.transaction("rw", SYNC_TABLES.map((t) => localDb.table(t)), async () => {
    for (const t of SYNC_TABLES) {
      const table = localDb.tableFor(t);
      for (const row of parsed.data![t] ?? []) {
        if (!row?.id || !row.updatedAt) continue;
        const cur = await table.get(row.id);
        if (!cur || row.updatedAt > cur.updatedAt) {
          await table.put({ ...(row as object), dirty: 1 } as never);
          n++;
        }
      }
    }
  });
  requestSync();
  return n;
}

export async function clearLocal() {
  await Promise.all(localDb.tables.map((t) => t.clear()));
}
