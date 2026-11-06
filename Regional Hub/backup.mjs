// Make an encrypted, consistent backup copy of the database.
//
//   node backup.mjs            -> backups/<db>-YYYYMMDD-HHMMSS.db
//   node backup.mjs D:\USB     -> writes the backup into another folder
//
// The copy is encrypted with the same DB_ENCRYPTION_KEY, so it is safe to put
// on a USB drive. Keep the .env (key) somewhere ELSE. The 30 newest backups in
// the default folder are kept; older ones are deleted.
import { createClient } from "@libsql/client";
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { dirname, join, resolve, basename } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const k = t.slice(0, t.indexOf("=")).trim();
    if (!(k in process.env)) process.env[k] = t.slice(t.indexOf("=") + 1).trim();
  }
}

const DEFAULT_DB = existsSync(join(here, "main_hub.db")) || existsSync(join(here, "migrate.mjs")) ? "main_hub.db" : "local.db";
const databaseUrl = process.env.DATABASE_URL || `file:${join(here, DEFAULT_DB)}`;
const dbPath = databaseUrl.replace(/^file:/, "");
if (!existsSync(dbPath)) {
  console.log(`No database at ${dbPath} yet - nothing to back up.`);
  process.exit(0);
}

const target = resolve(process.argv[2] || join(here, "backups"));
mkdirSync(target, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const out = join(target, `${basename(dbPath, ".db")}-${stamp}.db`);

const encryptionKey = process.env.DB_ENCRYPTION_KEY;
const client = createClient({ url: databaseUrl, ...(encryptionKey ? { encryptionKey } : {}) });
await client.execute({ sql: "VACUUM INTO ?", args: [out] });
client.close();
console.log(`Backup written: ${out}`);

if (!process.argv[2]) {
  const old = readdirSync(target).filter((f) => f.endsWith(".db")).sort().reverse().slice(30);
  for (const f of old) rmSync(join(target, f));
}
