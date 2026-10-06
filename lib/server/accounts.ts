import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { SYNC_TABLES } from "@/lib/types";
import { appUrl, sendMail } from "./mail";

// Email + password accounts, stored next to the Auth.js collections.
// A password account only exists once its email is confirmed, so every user's email is proven
// and Google sign-in can safely link to an account with the same address.

interface UserDoc {
  _id: ObjectId;
  name?: string | null;
  email: string;
  emailVerified: Date | null;
  image?: string | null;
  sessionsValidFrom?: Date; // sessions signed in before this are rejected
  dataEpoch?: number; // goes up each time the user starts over; phones holding an older copy drop it
}
interface CredentialDoc {
  _id: string; // userId
  hash: string;
  updatedAt: Date;
}
interface TokenDoc {
  _id: string; // sha256 of the token in the emailed link
  kind: "verify" | "reset";
  email: string;
  name?: string;
  hash?: string;
  expiresAt: Date;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(8).max(128);
export const LoginInput = z.object({ email, password: z.string().min(1).max(128) });
export const SignupInput = z.object({ name: z.string().trim().min(1).max(60), email, password });
export const EmailInput = z.object({ email });
export const ResetInput = z.object({ token: z.string().min(20).max(100), password });

const cols = (database: Db) => ({
  users: database.collection<UserDoc>("users"),
  credentials: database.collection<CredentialDoc>("credentials"),
  tokens: database.collection<TokenDoc>("authTokens"),
});

let indexesReady: Promise<void> | null = null;
function ensureIndexes(database: Db) {
  indexesReady ??= (async () => {
    const c = cols(database);
    await c.tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await c.users
      .createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } })
      .catch((e) => console.error("users.email index", e));
  })().catch((e) => {
    indexesReady = null;
    throw e;
  });
  return indexesReady;
}

async function open() {
  const database = await db();
  await ensureIndexes(database);
  return { database, ...cols(database) };
}

// ---------- passwords ----------

const N = 32768;

function derive(pw: string, salt: Buffer, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pw.normalize("NFKC"), salt, 32, { N: n, r: 8, p: 1, maxmem: 256 * n * 8 }, (e, key) => (e ? reject(e) : resolve(key))),
  );
}

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${N}$${salt.toString("base64")}$${(await derive(pw, salt, N)).toString("base64")}`;
}

async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = await derive(pw, Buffer.from(salt, "base64"), Number(n));
  return want.length === got.length && timingSafeEqual(want, got);
}

let dummyHash: Promise<string> | null = null;

/** Returns the user when the email and password match, otherwise null. */
export async function verifyLogin(input: z.infer<typeof LoginInput>): Promise<SessionUser | null> {
  const { users, credentials } = await open();
  const user = await users.findOne({ email: input.email });
  const cred = user && (await credentials.findOne({ _id: user._id.toHexString() }));
  if (!user || !cred) {
    // Spend the same time as a real check so the response doesn't reveal which emails have accounts.
    await verifyPassword(input.password, await (dummyHash ??= hashPassword(randomBytes(16).toString("hex"))));
    return null;
  }
  if (!(await verifyPassword(input.password, cred.hash))) return null;
  return { id: user._id.toHexString(), name: user.name ?? "", email: user.email, image: user.image ?? null };
}

// ---------- emailed links ----------

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

async function issueToken(tokens: ReturnType<typeof cols>["tokens"], doc: Omit<TokenDoc, "_id" | "expiresAt">, ttlMin: number) {
  const token = randomBytes(32).toString("base64url");
  await tokens.insertOne({ _id: digest(token), ...doc, expiresAt: new Date(Date.now() + ttlMin * 60_000) });
  return token;
}

/** Emails a confirmation link. The account is created only when the link is opened. */
export async function startSignup(input: z.infer<typeof SignupInput>) {
  const { users, tokens } = await open();
  const base = appUrl();
  if (await users.findOne({ email: input.email })) {
    // Same response either way, so the form can't be used to find out who has an account.
    await sendMail({
      to: input.email,
      subject: "You already have a Kharcha account",
      text: `Someone tried to sign up with this email, but it already has an account.\n\nSign in: ${base}/login\nForgot your password? ${base}/forgot\n\nIf this wasn't you, ignore this email.`,
    });
    return;
  }
  const token = await issueToken(tokens, { kind: "verify", email: input.email, name: input.name, hash: await hashPassword(input.password) }, 24 * 60);
  await sendMail({
    to: input.email,
    subject: "Confirm your email for Kharcha",
    text: `Hi ${input.name},\n\nOpen this link to finish creating your account. It works for 24 hours.\n\n${base}/verify?token=${token}\n\nIf you didn't sign up, ignore this email.`,
  });
}

export async function completeSignup(token: string): Promise<boolean> {
  const { users, credentials, tokens } = await open();
  const t = await tokens.findOneAndDelete({ _id: digest(token), kind: "verify", expiresAt: { $gt: new Date() } });
  if (!t?.hash) return false;
  if (await users.findOne({ email: t.email })) return true; // already created, e.g. through Google in the meantime
  try {
    const { insertedId } = await users.insertOne({ _id: new ObjectId(), name: t.name ?? "", email: t.email, emailVerified: new Date(), image: null });
    await credentials.insertOne({ _id: insertedId.toHexString(), hash: t.hash, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
  }
  return true;
}

/** Emails a reset link if the account exists. Also how a Google-only account gets a password. */
export async function startReset(input: z.infer<typeof EmailInput>) {
  const { users, tokens } = await open();
  if (!(await users.findOne({ email: input.email }))) return;
  const token = await issueToken(tokens, { kind: "reset", email: input.email }, 60);
  await sendMail({
    to: input.email,
    subject: "Reset your Kharcha password",
    text: `Open this link to choose a new password. It works for 1 hour.\n\n${appUrl()}/reset?token=${token}\n\nIf you didn't ask for this, ignore this email. Your password stays the same.`,
  });
}

export async function completeReset(input: z.infer<typeof ResetInput>): Promise<boolean> {
  const { users, credentials, tokens } = await open();
  const t = await tokens.findOneAndDelete({ _id: digest(input.token), kind: "reset", expiresAt: { $gt: new Date() } });
  const user = t && (await users.findOne({ email: t.email }));
  if (!user) return false;
  const now = new Date();
  await credentials.updateOne({ _id: user._id.toHexString() }, { $set: { hash: await hashPassword(input.password), updatedAt: now } }, { upsert: true });
  // The link proves the email, and a new password signs every other device out.
  await users.updateOne({ _id: user._id }, { $set: { sessionsValidFrom: now, emailVerified: user.emailVerified ?? now } });
  return true;
}

// ---------- sessions & deletion ----------

/** JWT sessions can't be revoked on their own, so each request checks the account still exists and the sign-in isn't stale. */
export async function isSessionLive(userId: string, authAt: number | undefined): Promise<boolean> {
  if (!ObjectId.isValid(userId)) return false;
  const user = await (await db()).collection<UserDoc>("users").findOne({ _id: new ObjectId(userId) }, { projection: { sessionsValidFrom: 1 } });
  if (!user) return false;
  return !user.sessionsValidFrom || (authAt ?? 0) >= user.sessionsValidFrom.getTime();
}

/** Signs the account out on every device, including the one asking. */
export async function revokeSessions(userId: string) {
  await (await db()).collection<UserDoc>("users").updateOne({ _id: new ObjectId(userId) }, { $set: { sessionsValidFrom: new Date() } });
}

export async function dataEpoch(userId: string): Promise<number> {
  const user = await (await db()).collection<UserDoc>("users").findOne({ _id: new ObjectId(userId) }, { projection: { dataEpoch: 1 } });
  return user?.dataEpoch ?? 0;
}

/** Start over: removes every entry and setting but keeps the account. The next sync seeds it like a new one. */
export async function resetUserData(userId: string) {
  const database = await db();
  await Promise.all([...SYNC_TABLES.map((t) => database.collection(t).deleteMany({ userId })), database.collection("reminderLog").deleteMany({ userId })]);
  await database.collection<UserDoc>("users").updateOne({ _id: new ObjectId(userId) }, { $inc: { dataEpoch: 1 } });
}

/** Removes the account and everything it owns. The user record goes last, so a failed run can be retried. */
export async function deleteAccount(userId: string) {
  const { database, users, credentials, tokens } = await open();
  const _id = new ObjectId(userId);
  const user = await users.findOne({ _id });
  await Promise.all([
    ...SYNC_TABLES.map((t) => database.collection(t).deleteMany({ userId })),
    database.collection("pushSubscriptions").deleteMany({ userId }),
    database.collection("reminderLog").deleteMany({ userId }),
    database.collection("accounts").deleteMany({ userId: _id }),
    credentials.deleteOne({ _id: userId }),
    user ? tokens.deleteMany({ email: user.email }) : null,
  ]);
  await users.deleteOne({ _id });
}
