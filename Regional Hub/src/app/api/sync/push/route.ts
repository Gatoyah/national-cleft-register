import { NextRequest, NextResponse } from "next/server";
import { db, syncQueue, patients, surgeries, facilityConfig } from "@/db";
import { getCurrentUser, canAccessSync } from "@/lib/auth";
import { logAudit, addSecurityHeaders, decrypt, checkRateLimit } from "@/lib/security";
import { eq, and, lt } from "drizzle-orm";

// Push pending data to main hub
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canAccessSync(user.role)) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    // Rate limiting for sync
    const rateLimit = await checkRateLimit(String(user.id), "/api/sync/push", "sync");
    if (!rateLimit.allowed) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Sync rate limit exceeded. Try again later." }, { status: 429 })
      );
    }

    // Get facility config
    const [config] = await db.select().from(facilityConfig).limit(1);
    if (!config || !config.mainHubUrl || !config.apiKey) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Facility not configured for sync" }, { status: 400 })
      );
    }

    // Get pending sync items (max 50 at a time)
    const pendingItems = await db
      .select()
      .from(syncQueue)
      .where(
        and(
          eq(syncQueue.status, "pending"),
          lt(syncQueue.attempts, syncQueue.maxAttempts)
        )
      )
      .orderBy(syncQueue.priority, syncQueue.createdAt)
      .limit(50);

    if (pendingItems.length === 0) {
      return addSecurityHeaders(
        NextResponse.json({ message: "No pending items to sync", synced: 0 })
      );
    }

    // Decrypt API key
    const apiKey = decrypt(config.apiKey);

    // Group by table
    const patientItems = pendingItems.filter((i) => i.tableName === "patients");
    const surgeryItems = pendingItems.filter((i) => i.tableName === "surgeries");

    const results = {
      patients: { sent: 0, success: 0, failed: 0 },
      surgeries: { sent: 0, success: 0, failed: 0 },
      errors: [] as string[],
    };

    // Sync patients
    if (patientItems.length > 0) {
      try {
        const response = await fetch(`${config.mainHubUrl}/api/sync/patients`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Facility-Code": config.facilityCode,
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({
            facilityCode: config.facilityCode,
            facilityApiKey: apiKey,
            patients: patientItems.map((i) => i.payload),
          }),
        });

        results.patients.sent = patientItems.length;

        if (response.ok) {
          const data = await response.json();
          results.patients.success = data.results?.created || 0;

          // Mark as synced
          for (const item of patientItems) {
            await db.delete(syncQueue).where(eq(syncQueue.id, item.id));
            await db
              .update(patients)
              .set({ syncStatus: "synced", syncedAt: new Date() })
              .where(eq(patients.localId, item.recordLocalId));
          }
        } else {
          results.patients.failed = patientItems.length;
          const errorText = await response.text();
          results.errors.push(`Patient sync failed: ${errorText}`);

          // Update attempt count
          for (const item of patientItems) {
            await db
              .update(syncQueue)
              .set({ 
                attempts: (item.attempts ?? 0) + 1,
                lastAttemptAt: new Date(),
                lastError: errorText,
              })
              .where(eq(syncQueue.id, item.id));
          }
        }
      } catch (error) {
        results.patients.failed = patientItems.length;
        results.errors.push(`Patient sync error: ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    // Sync surgeries
    if (surgeryItems.length > 0) {
      try {
        const response = await fetch(`${config.mainHubUrl}/api/sync/surgeries`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Facility-Code": config.facilityCode,
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({
            facilityCode: config.facilityCode,
            facilityApiKey: apiKey,
            surgeries: surgeryItems.map((i) => i.payload),
          }),
        });

        results.surgeries.sent = surgeryItems.length;

        if (response.ok) {
          const data = await response.json();
          results.surgeries.success = data.results?.created || 0;

          for (const item of surgeryItems) {
            await db.delete(syncQueue).where(eq(syncQueue.id, item.id));
            await db
              .update(surgeries)
              .set({ syncStatus: "synced", syncedAt: new Date() })
              .where(eq(surgeries.localId, item.recordLocalId));
          }
        } else {
          results.surgeries.failed = surgeryItems.length;
          const errorText = await response.text();
          results.errors.push(`Surgery sync failed: ${errorText}`);

          for (const item of surgeryItems) {
            await db
              .update(syncQueue)
              .set({ 
                attempts: (item.attempts ?? 0) + 1,
                lastAttemptAt: new Date(),
                lastError: errorText,
              })
              .where(eq(syncQueue.id, item.id));
          }
        }
      } catch (error) {
        results.surgeries.failed = surgeryItems.length;
        results.errors.push(`Surgery sync error: ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    // Update last sync time
    await db
      .update(facilityConfig)
      .set({ lastSyncAt: new Date() })
      .where(eq(facilityConfig.id, config.id));

    await logAudit(user.id, "sync_push", "syncQueue", null, null, results, request);

    return addSecurityHeaders(
      NextResponse.json({
        message: "Sync completed",
        results,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error("Sync error:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Sync failed" }, { status: 500 })
    );
  }
}
