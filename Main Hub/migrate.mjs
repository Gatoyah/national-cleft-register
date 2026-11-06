// Database setup / upgrade for this app. Safe to run on every start: each
// migration in ./drizzle is applied exactly once and recorded in __migrations.
//
// Only depends on @libsql/client (bundled with the app), so no npm/drizzle-kit
// is needed on the hospital machine.
//
// Usage:  node migrate.mjs
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (dotenv isn't bundled in the standalone build).
const envFile = join(here, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const databaseUrl = process.env.DATABASE_URL || `file:${join(here, "main_hub.db")}`;
const encryptionKey = process.env.DB_ENCRYPTION_KEY;
if (!encryptionKey || !/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
  if (process.env.ALLOW_UNENCRYPTED_DB !== "true") {
    console.error('DB_ENCRYPTION_KEY is missing/invalid. Run "node setup-env.mjs" first.');
    process.exit(1);
  }
}

const client = createClient({ url: databaseUrl, ...(encryptionKey ? { encryptionKey } : {}) });

try {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS __migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
} catch (e) {
  if (String(e?.code || e?.message).includes("NOTADB")) {
    console.error("Cannot open the database: DB_ENCRYPTION_KEY does not match this database file.");
    process.exit(1);
  }
  throw e;
}

const { rows: applied } = await client.execute("SELECT filename FROM __migrations");
const alreadyApplied = new Set(applied.map((r) => r.filename));

const migrationsDir = join(here, "drizzle");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

let ranAny = false;
for (const file of files) {
  if (alreadyApplied.has(file)) continue;
  console.log(`Applying ${file} ...`);
  const statements = readFileSync(join(migrationsDir, file), "utf-8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  const tx = await client.transaction("write");
  try {
    for (const statement of statements) await tx.execute(statement);
    await tx.execute({ sql: "INSERT INTO __migrations (filename) VALUES (?)", args: [file] });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    console.error(`Migration ${file} failed:`, e.message);
    process.exit(1);
  }
  ranAny = true;
}

console.log(ranAny ? "Database is up to date." : "Database already up to date.");
client.close();
process.exit(0);
