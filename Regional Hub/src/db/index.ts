import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || "file:local.db";

const globalForDb = globalThis as typeof globalThis & {
  __libsqlClient?: ReturnType<typeof createClient>;
};

export const client =
  globalForDb.__libsqlClient ??
  createClient({
    url: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__libsqlClient = client;
}

export const db = drizzle(client, { schema });

export * from "./schema";
