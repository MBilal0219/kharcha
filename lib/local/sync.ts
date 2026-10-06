import { localDb, getMeta, setMeta } from "./db";
import { SYNC_TABLES, type SyncTable } from "@/lib/types";

// Push dirty rows, pull server changes. Safe to call from the page or the service worker.

export interface SyncState {
  lastSyncedAt: string | null;
  status: "idle" | "syncing" | "offline" | "error" | "needs-login";
  message?: string;
}

let running: Promise<void> | null = null;

function online() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function setState(patch: Partial<SyncState>) {
  const cur = (await getMeta<SyncState>("sync")) ?? { lastSyncedAt: null, status: "idle" };
  await setMeta("sync", { ...cur, ...patch });
}

let again = false;

export function syncNow(): Promise<void> {
  if (running) {
    // Something changed while a sync was in flight: it missed that change, so run once more when it ends.
    again = true;
    return running;
  }
  running = doSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

async function doSync(afterReset = false): Promise<void> {
  if (!online()) {
    await setState({ status: "offline" });
    return;
  }
  const user = await getMeta("user");
  if (!user || (await getMeta("demo"))) return; // not signed in on this device yet, or demo mode

  const since = (await getMeta<string>("lastPulledAt")) ?? null;
  const changes: Partial<Record<SyncTable, unknown[]>> = {};
  for (const t of SYNC_TABLES) {
    const rows = await localDb.tableFor(t).where("dirty").equals(1).toArray();
    if (rows.length) changes[t] = rows.map(({ dirty: _d, ...r }) => r);
  }

  await setState({ status: "syncing" });
  let res: Response;
  try {
    res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ since, changes, epoch: (await getMeta<number>("epoch")) ?? 0 }),
    });
  } catch {
    await setState({ status: "offline" });
    return;
  }
  if (res.status === 401) {
    await setState({ status: "needs-login", message: "Sign in again to sync. Your entries are safe on this phone." });
    return;
  }
  if (!res.ok) {
    await setState({ status: "error", message: `Sync failed (${res.status}). Will retry.` });
    return;
  }

  const data = (await res.json()) as {
    reset?: boolean;
    epoch: number;
    serverNow: string;
    accepted: Partial<Record<SyncTable, { id: string; updatedAt: string }[]>>;
    serverChanges: Partial<Record<SyncTable, (Record<string, unknown> & { id: string; updatedAt: string })[]>>;
  };

  if (data.reset) {
    // The account was started over (here or on another device): drop this copy and pull the fresh one.
    await localDb.transaction("rw", [...SYNC_TABLES.map((t) => localDb.table(t)), localDb.meta], async () => {
      for (const t of SYNC_TABLES) await localDb.table(t).clear();
      await localDb.meta.delete("lastPulledAt");
      await localDb.meta.put({ key: "epoch", value: data.epoch });
    });
    if (!afterReset) return doSync(true);
    return;
  }

  await localDb.transaction("rw", [...SYNC_TABLES.map((t) => localDb.table(t)), localDb.meta], async () => {
    for (const t of SYNC_TABLES) {
      const table = localDb.tableFor(t);
      // Clear the dirty flag only if the row wasn't edited again while the request was in flight.
      for (const a of data.accepted[t] ?? []) {
        const local = await table.get(a.id);
        if (local && local.updatedAt === a.updatedAt) await table.update(a.id, { dirty: 0 } as never);
      }
      for (const row of data.serverChanges[t] ?? []) {
        const local = await table.get(row.id);
        if (!local || !local.dirty || row.updatedAt >= local.updatedAt) {
          await table.put({ ...(row as object), dirty: 0 } as never);
        }
      }
    }
    await localDb.meta.put({ key: "lastPulledAt", value: data.serverNow });
    await localDb.meta.put({ key: "epoch", value: data.epoch });
  });
  await setState({ status: "idle", lastSyncedAt: new Date().toISOString(), message: undefined });
}

export async function pendingCount(): Promise<number> {
  let n = 0;
  for (const t of SYNC_TABLES) n += await localDb.tableFor(t).where("dirty").equals(1).count();
  return n;
}

/** Ask for a sync soon; also registers Background Sync so Android can sync after the app closes. */
export function requestSync() {
  if (typeof window === "undefined") return;
  void syncNow();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("kharcha-sync"))
      .catch(() => {});
  }
}
