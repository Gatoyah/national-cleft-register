/** Runs once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startDailyBackups } = await import("@/lib/backup");
  const { startAutoSync } = await import("@/lib/sync");
  startDailyBackups();
  startAutoSync();
  try {
    const { needsSetup, getOrCreateSetupToken } = await import("@/lib/setup");
    if (await needsSetup()) getOrCreateSetupToken();
  } catch (e) {
    console.error("[startup] database not ready:", (e as Error).message);
  }
}
