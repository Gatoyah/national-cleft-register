import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || "file:main_hub.db";

/**
 * The SQLite file is encrypted at rest (AES via libsql/SQLite3MultipleCiphers)
 * with DB_ENCRYPTION_KEY. Without the key the file is unreadable, so a stolen
 * disk / USB copy / backup does not expose patient data.
 */
const encryptionKey = process.env.DB_ENCRYPTION_KEY;
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

if (!isBuild && (!encryptionKey || !/^[0-9a-fA-F]{64}$/.test(encryptionKey))) {
  if (process.env.ALLOW_UNENCRYPTED_DB !== "true") {
    throw new Error(
      "DB_ENCRYPTION_KEY is missing or invalid (must be 64 hex characters). " +
        'Run "node setup-env.mjs" to generate it. Patient data must not be stored unencrypted.'
    );
  }
}

const globalForDb = globalThis as typeof globalThis & {
  __libsqlClient?: ReturnType<typeof createClient>;
};

export const client =
  globalForDb.__libsqlClient ??
  createClient({
    url: databaseUrl,
    ...(encryptionKey ? { encryptionKey } : {}),
  });

globalForDb.__libsqlClient = client;

export const db = drizzle(client, { schema });

export * from "./schema";
