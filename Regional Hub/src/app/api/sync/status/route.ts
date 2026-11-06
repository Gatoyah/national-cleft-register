import { NextResponse } from "next/server";
import { db, syncQueue, patients, surgeries, facilityConfig } from "@/db";
import { count, eq, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api";
import { checkMainHubUrl } from "@/lib/sync";

export async function GET() {
  try {
    const user = await requireAuth();
    if (user instanceof NextResponse) return user;

    const [[config], [pending], [failed], [totalPatients], [totalSurgeries], [unsyncedPatients]] = await Promise.all([
      db.select().from(facilityConfig).limit(1),
      db.select({ n: count() }).from(syncQueue).where(eq(syncQueue.status, "pending")),
      db.select({ n: count() }).from(syncQueue).where(eq(syncQueue.status, "failed")),
      db.select({ n: count() }).from(patients),
      db.select({ n: count() }).from(surgeries),
      db.select({ n: count() }).from(patients).where(eq(patients.syncStatus, "pending")),
    ]);

    const summary = {
      stats: {
        pendingQueue: pending?.n ?? 0,
        failedQueue: failed?.n ?? 0,
        pendingPatients: unsyncedPatients?.n ?? 0,
        totalPatients: totalPatients?.n ?? 0,
        totalSurgeries: totalSurgeries?.n ?? 0,
      },
      lastSyncAt: config?.lastSyncAt ?? null,
      lastSyncError: config?.lastSyncError ?? null,
      timestamp: new Date().toISOString(),
    };
    if (!hasPermission(user.role, "sync.manage")) return NextResponse.json(summary);

    const problems = await db
      .select({ id: syncQueue.id, tableName: syncQueue.tableName, recordLocalId: syncQueue.recordLocalId, status: syncQueue.status, attempts: syncQueue.attempts, lastError: syncQueue.lastError, lastAttemptAt: syncQueue.lastAttemptAt })
      .from(syncQueue)
      .orderBy(desc(syncQueue.lastAttemptAt))
      .limit(50);

    return NextResponse.json({
      ...summary,
      facility: config
        ? {
            code: config.facilityCode,
            name: config.facilityName,
            region: config.region,
            mainHubUrl: config.mainHubUrl,
            apiKeyConfigured: !!config.apiKey,
            mainHubConfigured: !!config.mainHubUrl && !!config.apiKey,
            urlWarning: config.mainHubUrl ? checkMainHubUrl(config.mainHubUrl) : null,
            syncEnabled: config.syncEnabled,
            lastPullAt: config.lastPullAt,
            autoSyncMinutes: Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES) || 5),
          }
        : null,
      queue: problems.filter((p) => p.lastError),
    });
  } catch (error) {
    return apiError(error, "Failed to fetch sync status");
  }
}
