import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Db, Document } from "mongodb";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { isSharedTx, mirrorLoan, mirrorTx } from "@/lib/links/mirror";
import type { Loan, Tx } from "@/lib/types";
import type { SessionUser } from "./accounts";
import { appUrl, sendMail } from "./mail";

// Linking a person: someone you track loans with becomes a real Kharcha user, and from then on
// each loan between you exists on both accounts, seen from each side.
//
// The `links` collection is the only authority on who is linked. The `email` / `link` / `linkedUserId`
// fields on a `people` row are a copy for display; nothing here trusts them.

export interface LinkDoc {
  _id: string;
  aUserId: string; // who sent the invite
  aPersonId: string; // their `people` row for the other person
  aName: string;
  aEmail: string;
  email: string; // who was invited
  bUserId: string | null;
  bPersonId: string | null;
  status: "pending" | "linked" | "declined" | "ended";
  tokenHash: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class LinkError extends Error {
  constructor(public code: "not_found" | "own_email" | "already" | "wrong_account" | "expired" | "bad_email") {
    super(code);
  }
}

const INVITE_DAYS = 7;
const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const links = (database: Db) => database.collection<LinkDoc>("links");
const asId = (id: string) => id as unknown as Document["_id"];

let indexesReady: Promise<unknown> | null = null;
async function open() {
  const database = await db();
  indexesReady ??= Promise.all([
    links(database).createIndex({ aUserId: 1, status: 1 }),
    links(database).createIndex({ bUserId: 1, status: 1 }),
    links(database).createIndex({ email: 1, status: 1 }),
    links(database).createIndex({ tokenHash: 1 }),
  ]).catch(() => {
    indexesReady = null;
  });
  await indexesReady;
  return database;
}

/** Changes a `people` row from the server so that every phone of that user pulls it on the next sync. */
async function patchPerson(database: Db, userId: string, personId: string, set: Record<string, unknown>) {
  const now = new Date().toISOString();
  await database.collection("people").updateOne({ _id: asId(personId), userId }, { $set: { ...set, updatedAt: now, syncedAt: now } });
}

// ---------- inviting ----------

export async function invite(user: SessionUser, personId: string, rawEmail: string) {
  const parsed = Email.safeParse(rawEmail);
  if (!parsed.success) throw new LinkError("bad_email");
  const email = parsed.data;
  if (email === user.email.toLowerCase()) throw new LinkError("own_email");

  const database = await open();
  const person = await database.collection("people").findOne({ _id: asId(personId), userId: user.id, deletedAt: null });
  if (!person) throw new LinkError("not_found");
  const active = await links(database).findOne({
    status: { $in: ["pending", "linked"] },
    $or: [{ aUserId: user.id, aPersonId: personId }, { bUserId: user.id, bPersonId: personId }],
  });
  if (active?.status === "linked") throw new LinkError("already");
  if (active) await links(database).updateOne({ _id: active._id }, { $set: { status: "ended", tokenHash: null, updatedAt: new Date() } }); // re-sending replaces the old invite

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await links(database).insertOne({
    _id: randomUUID(),
    aUserId: user.id,
    aPersonId: personId,
    aName: user.name || user.email,
    aEmail: user.email.toLowerCase(),
    email,
    bUserId: null,
    bPersonId: null,
    status: "pending",
    tokenHash: digest(token),
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
    createdAt: now,
    updatedAt: now,
  });
  await patchPerson(database, user.id, personId, { email, link: "invited", linkedUserId: null });

  const from = user.name || user.email;
  const hasAccount = Boolean(await database.collection("users").findOne({ email }));
  await sendMail({
    to: email,
    subject: `${from} wants to share loan records with you on Kharcha`,
    text:
      `${from} (${user.email}) tracks money lent and borrowed with you in Kharcha, and invites you to see the same records from your side.\n\n` +
      `Once you accept, every loan and repayment between you two shows up for both of you. Nothing else in either account is shared.\n\n` +
      `${hasAccount ? "Open this link to accept or decline" : "Open this link to create your account and accept"} (works for ${INVITE_DAYS} days):\n${appUrl()}/link?token=${token}\n\n` +
      `If you don't know ${from}, ignore this email.`,
  });
}

export async function byToken(token: string): Promise<LinkDoc | null> {
  if (!token || token.length > 100) return null;
  return links(await open()).findOne({ tokenHash: digest(token), status: "pending", expiresAt: { $gt: new Date() } });
}

/** What the signed-in user needs to see: invites waiting for them. */
export async function incoming(user: SessionUser) {
  const list = await links(await open())
    .find({ email: user.email.toLowerCase(), status: "pending", expiresAt: { $gt: new Date() } })
    .toArray();
  return list.map((l) => ({ id: l._id, fromName: l.aName, fromEmail: l.aEmail }));
}

// ---------- answering ----------

async function mustBeFor(link: LinkDoc | null, user: SessionUser): Promise<LinkDoc> {
  if (!link || link.status !== "pending" || !link.expiresAt || link.expiresAt < new Date()) throw new LinkError("expired");
  if (link.email !== user.email.toLowerCase()) throw new LinkError("wrong_account");
  return link;
}

export async function respond(user: SessionUser, by: { id: string } | { token: string }, accept: boolean) {
  const database = await open();
  const found = "id" in by ? await links(database).findOne({ _id: by.id }) : await byToken(by.token);
  const link = await mustBeFor(found, user);
  const now = new Date();

  if (!accept) {
    await links(database).updateOne({ _id: link._id }, { $set: { status: "declined", tokenHash: null, updatedAt: now } });
    await patchPerson(database, link.aUserId, link.aPersonId, { link: null, linkedUserId: null });
    return;
  }

  // The accepting user's own record of the inviter. An existing same-name person is reused only if it has no
  // loans yet: both people may already have written the same loan down, and merging would count it twice.
  const people = database.collection("people");
  const stamp = now.toISOString();
  const sameName = await people.findOne({ userId: user.id, deletedAt: null, linkedUserId: { $in: [null, undefined] }, name: { $regex: `^${link.aName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
  const reusable = sameName && !(await database.collection("loans").findOne({ userId: user.id, personId: String(sameName._id), deletedAt: null }));
  const bPersonId = reusable ? String(sameName._id) : randomUUID();
  if (!reusable) {
    await people.insertOne({ _id: asId(bPersonId), userId: user.id, name: link.aName, updatedAt: stamp, deletedAt: null, syncedAt: stamp });
  }

  await links(database).updateOne({ _id: link._id }, { $set: { status: "linked", bUserId: user.id, bPersonId, tokenHash: null, updatedAt: now } });
  await patchPerson(database, link.aUserId, link.aPersonId, { link: "linked", linkedUserId: user.id, email: link.email });
  await patchPerson(database, user.id, bPersonId, { link: "linked", linkedUserId: link.aUserId, email: link.aEmail });

  // Bring the inviter's existing history with this person across.
  const loans = (await database.collection("loans").find({ userId: link.aUserId, personId: link.aPersonId, deletedAt: null }).toArray()).map(toRecord<Loan>);
  if (loans.length) {
    const txs = (await database.collection("transactions").find({ userId: link.aUserId, loanId: { $in: loans.map((l) => l.id) }, deletedAt: null }).toArray()).map(toRecord<Tx>);
    for (const l of loans) await writeMirror(database, "loans", user.id, mirrorLoan(l, link.aUserId, user.id, bPersonId), stamp);
    for (const t of txs.filter(isSharedTx)) await writeMirror(database, "transactions", user.id, mirrorTx(t, link.aUserId, user.id), stamp);
  }
}

/** Stops sharing. Each side keeps the records it has; later changes no longer cross over. */
export async function end(userId: string, personId: string) {
  const database = await open();
  const link = await links(database).findOne({
    status: { $in: ["pending", "linked"] },
    $or: [{ aUserId: userId, aPersonId: personId }, { bUserId: userId, bPersonId: personId }],
  });
  if (!link) return;
  await endOne(database, link);
}

async function endOne(database: Db, link: LinkDoc) {
  await links(database).updateOne({ _id: link._id }, { $set: { status: "ended", tokenHash: null, updatedAt: new Date() } });
  await patchPerson(database, link.aUserId, link.aPersonId, { link: null, linkedUserId: null });
  if (link.bUserId && link.bPersonId) await patchPerson(database, link.bUserId, link.bPersonId, { link: null, linkedUserId: null });
}

/** When an account is deleted or started over: nothing may keep flowing to or from it. */
export async function endAll(userId: string) {
  const database = await open();
  const mine = await links(database).find({ status: { $in: ["pending", "linked"] }, $or: [{ aUserId: userId }, { bUserId: userId }] }).toArray();
  for (const link of mine) await endOne(database, link);
}

// ---------- keeping both sides in step ----------

function toRecord<T>(doc: Document): T {
  const { _id, userId: _u, syncedAt: _s, ...rest } = doc;
  return { id: String(_id), ...rest } as T;
}

/** Writes one mirrored record into the other person's data, unless they already hold a newer version of it. */
async function writeMirror(database: Db, table: "loans" | "transactions", toUserId: string, rec: Loan | Tx, serverNow: string) {
  const col = database.collection(table);
  const cur = await col.findOne({ _id: asId(rec.id) });
  if (cur && (cur.userId !== toUserId || String(cur.updatedAt) >= rec.updatedAt)) return;
  const { id, ...data } = rec;
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)); // an undefined would be stored as null
  await col.replaceOne({ _id: asId(id), userId: toUserId }, { ...clean, userId: toUserId, syncedAt: serverNow }, { upsert: true });
}

/**
 * Called after a user's sync has been saved: copies any change to a shared loan, or to a movement on one,
 * into the linked person's data. `syncedAt` is the server's time, so their phone pulls it on its next sync.
 */
export async function mirrorChanges(database: Db, userId: string, changed: { loans: Loan[]; transactions: Tx[] }, serverNow: string) {
  const shared = changed.transactions.filter(isSharedTx);
  const withPerson = changed.loans.filter((l) => l.personId);
  if (!shared.length && !withPerson.length) return;

  const mine = await links(database).find({ status: "linked", $or: [{ aUserId: userId }, { bUserId: userId }] }).toArray();
  if (!mine.length) return;
  // my person id → the linked user and their person id for me
  const other = new Map(mine.map((l) => (l.aUserId === userId ? [l.aPersonId, { userId: l.bUserId!, personId: l.bPersonId! }] : [l.bPersonId!, { userId: l.aUserId, personId: l.aPersonId }])));

  for (const loan of withPerson) {
    const to = other.get(loan.personId!);
    if (to) await writeMirror(database, "loans", to.userId, mirrorLoan(loan, userId, to.userId, to.personId), serverNow);
  }
  if (!shared.length) return;
  const loanDocs = await database.collection("loans").find({ userId, _id: { $in: [...new Set(shared.map((t) => t.loanId!))].map(asId) } }).toArray();
  const personOfLoan = new Map(loanDocs.map((l) => [String(l._id), l.personId as string | null]));
  for (const tx of shared) {
    const personId = personOfLoan.get(tx.loanId!);
    const to = personId ? other.get(personId) : undefined;
    if (to) await writeMirror(database, "transactions", to.userId, mirrorTx(tx, userId, to.userId), serverNow);
  }
}
