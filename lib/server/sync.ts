import "server-only";
import { randomUUID } from "node:crypto";
import type { Db, Document } from "mongodb";
import { db } from "@/lib/db/client";
import { schemas } from "@/lib/db/schemas";
import { starterData } from "@/lib/seed";
import { SYNC_TABLES, type SyncTable } from "@/lib/types";

const MAX_ROWS_PER_TABLE = 2000;
const MAX_ROWS_PER_USER = 20_000; // per table, tombstones included: years of normal use, but one account can't fill the cluster
const CURSOR_OVERLAP_MS = 10_000; // re-pull a few seconds to cover concurrent writes; LWW makes it harmless

let indexesReady: Promise<void> | null = null;

export function ensureIndexes(database: Db) {
  if (!indexesReady) {
    indexesReady = (async () => {
      await Promise.all(
        SYNC_TABLES.map((t) => database.collection(t).createIndex({ userId: 1, syncedAt: 1 })),
      );
      await database.collection("transactions").createIndex({ userId: 1, day: 1 });
      await database.collection("loans").createIndex({ userId: 1, status: 1, dueDate: 1 });
      await database.collection("pushSubscriptions").createIndex({ endpoint: 1 }, { unique: true });
      await database.collection("pushSubscriptions").createIndex({ userId: 1 });
      await database.collection("reminderLog").createIndex({ userId: 1, day: 1, kind: 1 }, { unique: true });
    })().catch((e) => {
      indexesReady = null;
      throw e;
    });
  }
  return indexesReady;
}

function isDupKey(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;
}

/** Creates starter wallets, categories and the buffer goal once per account. */
async function ensureSeed(database: Db, userId: string, now: string) {
  const settingsId = `settings:${userId}`;
  const exists = await database.collection("settings").findOne({ _id: settingsId as unknown as Document["_id"] });
  if (exists) return;
  const data = starterData(userId, randomUUID);
  const stamp = { userId, updatedAt: now, deletedAt: null, syncedAt: now };
  try {
    // Insert settings first: its fixed _id acts as a lock against double seeding.
    const { id, ...rest } = data.settings[0];
    await database.collection("settings").insertOne({ _id: id as unknown as Document["_id"], ...rest, ...stamp });
  } catch (e) {
    if (isDupKey(e)) return;
    throw e;
  }
  for (const table of ["wallets", "categories", "goals"] as const) {
    const docs = data[table].map(({ id, ...rest }) => ({ _id: id as unknown as Document["_id"], ...rest, ...stamp }));
    if (docs.length) await database.collection(table).insertMany(docs);
  }
}

/** Some ids are derived from the userId so they're unique per account. Reject ids that point at someone else. */
function idAllowed(table: SyncTable, id: string, userId: string) {
  if (table === "settings") return id === `settings:${userId}`;
  if (table === "periodSettings" || table === "dayClosures" || table === "dayOverrides") return id.startsWith(`${userId}:`);
  return true;
}

function toClient(doc: Document) {
  const { _id, userId: _u, syncedAt: _s, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export interface SyncBody {
  since: string | null;
  epoch?: number;
  changes: Partial<Record<SyncTable, unknown[]>>;
}

export async function handleSync(userId: string, body: SyncBody) {
  const database = await db();
  await ensureIndexes(database);
  const serverNow = new Date().toISOString();
  await ensureSeed(database, userId, serverNow);

  const accepted: Partial<Record<SyncTable, { id: string; updatedAt: string }[]>> = {};
  const serverChanges: Partial<Record<SyncTable, Record<string, unknown>[]>> = {};
  const rejected: { table: string; id?: string; reason: string }[] = [];

  for (const table of SYNC_TABLES) {
    const incoming = (body.changes?.[table] ?? []).slice(0, MAX_ROWS_PER_TABLE);
    if (!incoming.length) continue;
    const col = database.collection(table);

    const rows: Record<string, unknown>[] = [];
    for (const raw of incoming) {
      const parsed = schemas[table].safeParse(raw);
      if (!parsed.success) {
        rejected.push({ table, id: (raw as { id?: string })?.id, reason: "invalid" });
        continue;
      }
      const row = parsed.data as Record<string, unknown> & { id: string };
      if (!idAllowed(table, row.id, userId)) {
        rejected.push({ table, id: row.id, reason: "id" });
        continue;
      }
      rows.push(row);
    }
    if (!rows.length) continue;

    const ids = rows.map((r) => r.id as string);
    const existing = new Map(
      (await col.find({ _id: { $in: ids as unknown as Document["_id"][] } }).toArray()).map((d) => [String(d._id), d]),
    );

    // Only count when the phone sends rows the server hasn't seen.
    let room = rows.some((r) => !existing.has(r.id as string))
      ? MAX_ROWS_PER_USER - (await col.countDocuments({ userId }))
      : 0;

    const ops = [];
    const acc: { id: string; updatedAt: string }[] = [];
    const stale: Record<string, unknown>[] = [];
    for (const row of rows) {
      const { id, ...data } = row as { id: string; updatedAt: string } & Record<string, unknown>;
      const cur = existing.get(id);
      if (cur && cur.userId !== userId) {
        rejected.push({ table, id, reason: "owner" });
        continue;
      }
      if (!cur && room-- <= 0) {
        rejected.push({ table, id, reason: "quota" });
        continue;
      }
      acc.push({ id, updatedAt: data.updatedAt });
      if (cur && String(cur.updatedAt) >= data.updatedAt) {
        stale.push(toClient(cur)); // server copy is newer: send it back so the phone takes it
        continue;
      }
      ops.push({
        replaceOne: {
          filter: { _id: id as unknown as Document["_id"], userId },
          replacement: { ...data, userId, syncedAt: serverNow },
          upsert: true,
        },
      });
    }
    if (ops.length) await col.bulkWrite(ops, { ordered: false });
    accepted[table] = acc;
    if (stale.length) serverChanges[table] = stale;
  }

  // Pull everything that changed on the server since the phone's cursor.
  for (const table of SYNC_TABLES) {
    const filter: Document = { userId };
    if (body.since) filter.syncedAt = { $gt: body.since };
    const docs = await database.collection(table).find(filter).toArray();
    if (!docs.length) continue;
    const list = serverChanges[table] ?? [];
    const seen = new Set(list.map((d) => d.id));
    for (const d of docs) {
      const c = toClient(d);
      if (!seen.has(c.id)) list.push(c);
    }
    serverChanges[table] = list;
  }

  const cursor = new Date(Date.parse(serverNow) - CURSOR_OVERLAP_MS).toISOString();
  return { serverNow: cursor, accepted, serverChanges, rejected };
}
