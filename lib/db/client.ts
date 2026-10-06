import "server-only";
import { MongoClient, type Db } from "mongodb";

// One cached client per serverless instance. Created lazily so `next build` works without env vars.
const g = globalThis as unknown as { _mongo?: Promise<MongoClient> };

export function mongoClient(): Promise<MongoClient> {
  if (!g._mongo) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    g._mongo = new MongoClient(uri, { maxPoolSize: 10 }).connect();
  }
  return g._mongo;
}

export async function db(): Promise<Db> {
  return (await mongoClient()).db(process.env.MONGODB_DB ?? "kharcha");
}
