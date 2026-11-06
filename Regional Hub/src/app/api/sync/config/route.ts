import { NextRequest, NextResponse } from "next/server";
import { db, facilityConfig } from "@/db";
import { eq } from "drizzle-orm";
import { requireMutation } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError } from "@/lib/api";
import { encrypt, decrypt, sha256 } from "@/lib/crypto";
import { checkMainHubUrl, testConnection } from "@/lib/sync";
import { z } from "zod";

const schema = z.object({
  facilityCode: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9_-]+$/),
  facilityName: z.string().trim().min(1).max(255).optional(),
  mainHubUrl: z.string().trim().url(),
  apiKey: z.string().trim().max(200).optional(), // leave empty to keep the saved key
  syncEnabled: z.boolean().optional(),
});

/**
 * Save the connection to the Main Hub. The API key is stored encrypted
 * (AES-256-GCM) and never returned. If the Main Hub is reachable, the key is
 * checked first and a wrong key/facility code is refused; if it is not
 * reachable (offline), the settings are saved and used once it is back.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireMutation(request, "sync.manage");
    if (user instanceof NextResponse) return user;

    const d = schema.parse(sanitizeObject(await request.json()));
    const mainHubUrl = d.mainHubUrl.replace(/\/+$/, "");
    const urlError = checkMainHubUrl(mainHubUrl);
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 });

    const [existing] = await db.select().from(facilityConfig).limit(1);
    if (!existing) return NextResponse.json({ error: "No facility configuration found - run setup first" }, { status: 404 });

    const apiKey = d.apiKey || (existing.apiKey ? decrypt(existing.apiKey) : "");
    if (!apiKey) return NextResponse.json({ error: "API key is required" }, { status: 400 });

    const test = await testConnection(mainHubUrl, apiKey);
    if (test.reachable && !test.ok) {
      return NextResponse.json({ error: test.error }, { status: 400 });
    }
    const facilityCode = d.facilityCode.toUpperCase();
    if (test.ok && test.facility && test.facility.code.toUpperCase() !== facilityCode) {
      return NextResponse.json({ error: `This API key belongs to facility ${test.facility.code}, not ${facilityCode}.` }, { status: 400 });
    }

    await db
      .update(facilityConfig)
      .set({
        facilityCode,
        facilityName: d.facilityName || existing.facilityName,
        mainHubUrl,
        apiKey: encrypt(apiKey),
        apiKeyHash: sha256(apiKey),
        ...(d.syncEnabled !== undefined ? { syncEnabled: d.syncEnabled } : {}),
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(facilityConfig.id, existing.id));

    await logAudit({ userId: user.id, action: "update_sync_config", tableName: "facility_config", recordId: existing.id, newValues: { facilityCode, mainHubUrl, keyChanged: !!d.apiKey, verified: test.ok } });

    return NextResponse.json({
      message: test.ok
        ? `Connected to the Main Hub as ${test.facility?.name ?? facilityCode}. Sync settings saved.`
        : "Saved. The Main Hub is not reachable right now; data will sync automatically when it is.",
      verified: test.ok,
    });
  } catch (error) {
    return apiError(error, "Failed to update sync configuration");
  }
}
