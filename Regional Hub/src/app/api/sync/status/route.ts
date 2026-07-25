import { NextResponse } from "next/server";
import { db, syncQueue, patients, surgeries, facilityConfig } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { addSecurityHeaders } from "@/lib/security";
import { count, eq } from "drizzle-orm";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    const [
      config,
      pendingQueueCount,
      pendingPatientCount,
      pendingSurgeryCount,
      totalPatientCount,
      totalSurgeryCount,
    ] = await Promise.all([
      db.select().from(facilityConfig).limit(1),
      db.select({ count: count() }).from(syncQueue).where(eq(syncQueue.status, "pending")),
      db.select({ count: count() }).from(patients).where(eq(patients.syncStatus, "pending")),
      db.select({ count: count() }).from(surgeries).where(eq(surgeries.syncStatus, "pending")),
      db.select({ count: count() }).from(patients),
      db.select({ count: count() }).from(surgeries),
    ]);

    return addSecurityHeaders(
      NextResponse.json({
        facility: config[0] ? {
          code: config[0].facilityCode,
          name: config[0].facilityName,
          region: config[0].region,
          mainHubConfigured: !!config[0].mainHubUrl,
          syncEnabled: config[0].syncEnabled,
          lastSyncAt: config[0].lastSyncAt,
        } : null,
        stats: {
          pendingQueue: pendingQueueCount[0]?.count || 0,
          pendingPatients: pendingPatientCount[0]?.count || 0,
          pendingSurgeries: pendingSurgeryCount[0]?.count || 0,
          totalPatients: totalPatientCount[0]?.count || 0,
          totalSurgeries: totalSurgeryCount[0]?.count || 0,
        },
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error("Error fetching sync status:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to fetch sync status" }, { status: 500 })
    );
  }
}
