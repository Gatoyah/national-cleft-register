import { mkdirSync, readdirSync, rmSync } from "fs";
import { dirname, join, basename } from "path";
import { client } from "@/db";

const KEEP = 30;

/** Encrypted point-in-time copy of the database into <db folder>/backups. */
export async function backupDatabase(): Promise<string | null> {
  const url = process.env.DATABASE_URL || "file:main_hub.db";
  if (!url.startsWith("file:")) return null;
  const dbPath = url.slice(5);
  const dir = join(dirname(dbPath), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const out = join(dir, `${basename(dbPath, ".db")}-${stamp}.db`);
  await client.execute({ sql: "VACUUM INTO ?", args: [out] });
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".db")).sort().reverse().slice(KEEP)) {
    rmSync(join(dir, f), { force: true });
  }
  return out;
}

export function startDailyBackups() {
  const g = globalThis as typeof globalThis & { __ncrBackupTimer?: NodeJS.Timeout };
  if (g.__ncrBackupTimer || process.env.DISABLE_AUTO_BACKUP === "true") return;
  const DAY = 24 * 60 * 60 * 1000;
  g.__ncrBackupTimer = setInterval(() => {
    backupDatabase()
      .then((p) => p && console.log(`[backup] ${p}`))
      .catch((e) => console.error("[backup] failed:", e));
  }, DAY);
  g.__ncrBackupTimer.unref?.();
}
