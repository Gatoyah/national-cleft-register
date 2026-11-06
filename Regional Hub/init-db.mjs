// Database setup / upgrade for the Regional Hub. Safe to run on every start:
// tables are created if missing and new columns are added to older databases.
// The database file is encrypted at rest with DB_ENCRYPTION_KEY.
//
// Usage:  node init-db.mjs
import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
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
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

const databaseUrl = process.env.DATABASE_URL || `file:${join(here, "local.db")}`;
const encryptionKey = process.env.DB_ENCRYPTION_KEY;
if (!encryptionKey || !/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
  if (process.env.ALLOW_UNENCRYPTED_DB !== "true") {
    console.error('DB_ENCRYPTION_KEY is missing/invalid. Run "node setup-env.mjs" first.');
    process.exit(1);
  }
}
const client = createClient({ url: databaseUrl, ...(encryptionKey ? { encryptionKey } : {}) });

// Columns added after the first release: [table, column, definition]
const ADDED_COLUMNS = [
  ["facility_config", "last_pull_at", "INTEGER"],
  ["facility_config", "last_sync_error", "TEXT"],
  ["patients", "is_lost_to_follow_up", "INTEGER DEFAULT 0"],
  ["patients", "consent_clinical_care", "INTEGER DEFAULT 0"],
  ["patients", "consent_research", "INTEGER DEFAULT 0"],
  ["patients", "consent_data_sharing", "INTEGER DEFAULT 0"],
  ["patients", "consent_date", "TEXT"],
  ["surgeries", "origin", "TEXT DEFAULT 'local'"],
  ["surgeries", "sync_error", "TEXT"],
];

async function initDb() {
  try {
    await client.execute("SELECT 1");
  } catch (e) {
    if (String(e?.code || e?.message).includes("NOTADB")) {
      console.error("Cannot open the database: DB_ENCRYPTION_KEY does not match this database file.");
      process.exit(1);
    }
    throw e;
  }

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS facility_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      facility_name TEXT NOT NULL,
      facility_code TEXT NOT NULL UNIQUE,
      facility_type TEXT NOT NULL DEFAULT 'regional_hub',
      region TEXT NOT NULL,
      district TEXT,
      main_hub_url TEXT,
      api_key TEXT,
      api_key_hash TEXT,
      last_sync_at INTEGER,
      sync_enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL,
      phone TEXT,
      professional_id TEXT,
      is_active INTEGER DEFAULT 1,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until INTEGER,
      last_login_at INTEGER,
      last_login_ip TEXT,
      password_changed_at INTEGER DEFAULT (unixepoch()),
      must_change_password INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      session_token TEXT NOT NULL UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      ncr_id TEXT UNIQUE,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      last_name TEXT NOT NULL,
      sex TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      place_of_birth TEXT,
      region_of_residence TEXT NOT NULL,
      district_of_residence TEXT,
      town_village TEXT,
      gps_latitude REAL,
      gps_longitude REAL,
      caregiver_name TEXT NOT NULL,
      caregiver_relationship TEXT,
      caregiver_phone TEXT,
      caregiver_phone_2 TEXT,
      is_deceased INTEGER DEFAULT 0,
      deceased_date TEXT,
      sync_status TEXT DEFAULT 'pending',
      synced_at INTEGER,
      sync_error TEXT,
      registered_by_user_id INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      diagnosis_date TEXT NOT NULL,
      diagnosed_antenatally INTEGER DEFAULT 0,
      diagnosed_at_birth INTEGER DEFAULT 0,
      cleft_type TEXT NOT NULL,
      lip_involved INTEGER DEFAULT 0,
      lip_laterality TEXT,
      lip_complete INTEGER,
      alveolar_involved INTEGER DEFAULT 0,
      palate_involved INTEGER DEFAULT 0,
      palate_type TEXT,
      lahsal_code TEXT,
      has_associated_anomalies INTEGER DEFAULT 0,
      associated_anomalies_details TEXT,
      sync_status TEXT DEFAULT 'pending',
      synced_at INTEGER,
      diagnosed_by_user_id INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS surgeries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      surgery_date TEXT NOT NULL,
      surgery_type TEXT NOT NULL,
      is_primary_surgery INTEGER DEFAULT 1,
      procedure_description TEXT,
      surgeon_name TEXT,
      surgeon_user_id INTEGER REFERENCES users(id),
      duration_minutes INTEGER,
      complications INTEGER DEFAULT 0,
      complications_details TEXT,
      discharge_date TEXT,
      discharge_condition TEXT,
      sync_status TEXT DEFAULT 'pending',
      synced_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_local_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 5,
      last_attempt_at INTEGER,
      last_error TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      request_count INTEGER DEFAULT 1,
      window_start INTEGER NOT NULL DEFAULT (unixepoch()),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS blocked_ips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT NOT NULL UNIQUE,
      reason TEXT,
      blocked_until INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  for (const [table, column, definition] of ADDED_COLUMNS) {
    const { rows } = await client.execute(`PRAGMA table_info(${table})`);
    if (!rows.some((r) => r.name === column)) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`  added ${table}.${column}`);
    }
  }

  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS sync_queue_status_idx ON sync_queue (status, table_name);
    CREATE INDEX IF NOT EXISTS sync_queue_record_idx ON sync_queue (table_name, record_local_id);
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at);
    CREATE INDEX IF NOT EXISTS diagnoses_patient_idx ON diagnoses (patient_id);
    CREATE INDEX IF NOT EXISTS surgeries_patient_idx ON surgeries (patient_id);
  `);

  console.log("Database is up to date.");
  client.close();
}

initDb().catch((e) => {
  console.error("Database setup failed:", e.message);
  process.exit(1);
});
