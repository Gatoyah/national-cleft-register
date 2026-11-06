// Creates / completes the .env file for this app.
//
//   node setup-env.mjs
//
// - If .env does not exist it is created from .env.example.
// - Every secret that is missing or still a "replace-with-..." placeholder is
//   replaced with a freshly generated random 64-character hex value.
// - Existing real values are NEVER changed (changing DB_ENCRYPTION_KEY would
//   make the existing database unreadable).
//
// Only uses Node built-ins, so it works in the packaged app without npm.
import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, ".env");
const examplePath = join(here, ".env.example");

const SECRET_KEYS = ["DB_ENCRYPTION_KEY", "CSRF_SECRET", "SESSION_SECRET", "ENCRYPTION_KEY"];
const isPlaceholder = (v) => !v || v.startsWith("replace-with");

const text = existsSync(envPath)
  ? readFileSync(envPath, "utf-8")
  : existsSync(examplePath)
    ? readFileSync(examplePath, "utf-8")
    : "";

const lines = text.split(/\r?\n/);
const seen = new Set();
const generated = [];

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
  if (!m) continue;
  const [, key, rawValue] = m;
  seen.add(key);
  if (SECRET_KEYS.includes(key) && isPlaceholder(rawValue.trim())) {
    lines[i] = `${key}=${randomBytes(32).toString("hex")}`;
    generated.push(key);
  }
}

// Make sure every secret this app needs exists, even if .env predates it.
const exampleText = existsSync(examplePath) ? readFileSync(examplePath, "utf-8") : "";
const required = SECRET_KEYS.filter((k) => k === "DB_ENCRYPTION_KEY" || new RegExp(`^${k}=`, "m").test(exampleText));
for (const key of required) {
  if (!seen.has(key)) {
    lines.push(`${key}=${randomBytes(32).toString("hex")}`);
    generated.push(key);
  }
}

writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
try { chmodSync(envPath, 0o600); } catch { /* Windows */ }

if (generated.length) {
  console.log(`.env ready. Generated new secrets: ${generated.join(", ")}`);
  if (generated.includes("DB_ENCRYPTION_KEY")) {
    console.log("");
    console.log("IMPORTANT: Back up the .env file somewhere safe (NOT next to the database backups).");
    console.log("Without DB_ENCRYPTION_KEY the patient database can never be opened again.");
  }
} else {
  console.log(".env already complete - nothing changed.");
}
