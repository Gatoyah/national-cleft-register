// One-time database setup for deployed installs.
//
// Only depends on @libsql/client, which is already bundled in the standalone
// production build -- no drizzle-kit, no npm install required on the target
// machine. Applies each *.sql file in ./drizzle, in order, exactly once.
//
// Usage:  node migrate.mjs

import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, existsSync } from "fs";

// Minimal .env loader (avoids depending on the "dotenv" package, which isn't
// bundled in the standalone production build).
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const databaseUrl = process.env.DATABASE_URL || "file:main_hub.db";
const client = createClient({ url: databaseUrl });

await client.execute(`
  CREATE TABLE IF NOT EXISTS __migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const { rows: applied } = await client.execute("SELECT filename FROM __migrations");
const alreadyApplied = new Set(applied.map((r) => r.filename));

const files = readdirSync("./drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort();

let ranAny = false;
for (const file of files) {
  if (alreadyApplied.has(file)) continue;

  console.log(`Applying ${file} ...`);
  const sql = readFileSync(`./drizzle/${file}`, "utf-8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.execute(statement);
  }
  await client.execute({
    sql: "INSERT INTO __migrations (filename) VALUES (?)",
    args: [file],
  });
  ranAny = true;
}

console.log(ranAny ? `Database is up to date (${databaseUrl}).` : `Nothing to apply -- already up to date (${databaseUrl}).`);
process.exit(0);
