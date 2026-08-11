import { NextRequest, NextResponse } from "next/server";
import { db, facilityConfig } from "@/db";
import { getCurrentUser, canAccessSync } from "@/lib/auth";
import { addSecurityHeaders, encrypt, hashApiKey, sanitizeObject, logAudit } from "@/lib/security";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateConfigSchema = z.object({
  facilityCode: z.string().min(1).max(20),
  facilityName: z.string().min(1).max(255).optional(),
  mainHubUrl: z.string().url(),
  apiKey: z.string().min(1),
});

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canAccessSync(user.role)) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = updateConfigSchema.parse(sanitizedBody);

    const [existing] = await db.select().from(facilityConfig).limit(1);
    if (!existing) {
      return addSecurityHeaders(
        NextResponse.json({ error: "No facility configuration found" }, { status: 404 })
      );
    }

    const encryptedApiKey = encrypt(validatedData.apiKey);
    const apiKeyHash = hashApiKey(validatedData.apiKey);

    await db
      .update(facilityConfig)
      .set({
        facilityCode: validatedData.facilityCode.toUpperCase(),
        facilityName: validatedData.facilityName || existing.facilityName,
        mainHubUrl: validatedData.mainHubUrl.replace(/\/$/, ""),
        apiKey: encryptedApiKey,
        apiKeyHash: apiKeyHash,
        updatedAt: new Date(),
      })
      .where(eq(facilityConfig.id, existing.id));

    await logAudit(user.id, "update_sync_config", "facilityConfig", existing.id, null, {
      facilityCode: validatedData.facilityCode,
      mainHubUrl: validatedData.mainHubUrl,
    }, request);

    return addSecurityHeaders(
      NextResponse.json({ message: "Sync configuration updated successfully" })
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      );
    }
    console.error("Error updating facility config:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to update sync configuration" }, { status: 500 })
    );
  }
}
