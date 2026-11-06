/** Runs once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startDailyBackups } = await import("@/lib/backup");
  startDailyBackups();
  // Print the first-run setup token in the server window if no admin exists yet.
  try {
    const { needsSetup, getOrCreateSetupToken } = await import("@/lib/setup");
    if (await needsSetup()) getOrCreateSetupToken();
  } catch (e) {
    console.error("[startup] database not ready:", (e as Error).message);
  }
}
