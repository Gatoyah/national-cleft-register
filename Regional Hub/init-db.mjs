// Database initialization script for Regional Hub
import { createClient } from "@libsql/client";

const client = createClient({ url: "file:./local.db" });

async function initDb() {
  console.log("Creating database tables...");
  
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

  console.log("Database tables created successfully!");
  await client.close();
}

initDb().catch(console.error);
