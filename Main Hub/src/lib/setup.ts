import crypto from "crypto";
import { writeFileSync, rmSync } from "fs";
import { join } from "path";
import { db, users } from "@/db";
import { count } from "drizzle-orm";

/**
 * First-run setup protection.
 *
 * Until the first administrator exists, anyone who can reach the server could
 * otherwise claim it. So setup requires a one-time SETUP TOKEN that is only
 * visible to whoever has access to the server machine itself:
 *   - printed in the server console window, and
 *   - written to "setup-token.txt" in the app folder.
 * (Or set SETUP_TOKEN in .env to choose it yourself.)
 */
const g = globalThis as typeof globalThis & { __ncrSetupToken?: string };

function tokenFilePath() {
  return join(process.cwd(), "setup-token.txt");
}

export async function needsSetup(): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(users);
  return (row?.n ?? 0) === 0;
}

export function getOrCreateSetupToken(): string {
  if (process.env.SETUP_TOKEN && process.env.SETUP_TOKEN.length >= 12) return process.env.SETUP_TOKEN;
  if (!g.__ncrSetupToken) {
    g.__ncrSetupToken = crypto.randomBytes(9).toString("base64url");
    try {
      writeFileSync(tokenFilePath(), g.__ncrSetupToken + "\n", { mode: 0o600 });
    } catch {
      /* read-only folder: console output is enough */
    }
    console.log("=".repeat(64));
    console.log(" FIRST-RUN SETUP: open the app in a browser and enter this token");
    console.log(`   SETUP TOKEN:  ${g.__ncrSetupToken}`);
    console.log(` (also saved in ${tokenFilePath()})`);
    console.log("=".repeat(64));
  }
  return g.__ncrSetupToken;
}

export function verifySetupToken(provided: string): boolean {
  const expected = getOrCreateSetupToken();
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function clearSetupToken() {
  g.__ncrSetupToken = undefined;
  try {
    rmSync(tokenFilePath(), { force: true });
  } catch {
    /* ignore */
  }
}
