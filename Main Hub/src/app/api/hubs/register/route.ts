import { NextRequest, NextResponse } from "next/server";
import { db, facilities, apiKeys } from "@/db";
import { requireMutation, generateApiKey } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError, REGIONS, optionalText } from "@/lib/api";
import { z } from "zod";

const createHubSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  code: z.string().min(1, "Code is required").max(10).regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, - and _ only"),
  facilityType: z.enum(["co_hub", "regional_centre", "district_hospital", "mission_hospital"]),
  region: z.enum(REGIONS),
  district: optionalText(100),
  address: optionalText(500),
  phone: optionalText(20),
  email: z.string().email().optional().or(z.literal("")),
  hasInternet: z.coerce.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutation(request, "hubs.manage");
    if (user instanceof NextResponse) return user;

    const d = createHubSchema.parse(sanitizeObject(await request.json()));
    const [hub] = await db
      .insert(facilities)
      .values({
        name: d.name,
        code: d.code.toUpperCase(),
        facilityType: d.facilityType,
        region: d.region,
        district: d.district || null,
        address: d.address || null,
        phone: d.phone || null,
        email: d.email || null,
        hasInternet: !!d.hasInternet,
        isActive: true,
      })
      .returning();

    // The raw key is returned exactly once; only its SHA-256 hash is stored.
    const { rawKey, keyHash, keyPrefix } = generateApiKey();
    await db.insert(apiKeys).values({ facilityId: hub.id, keyHash, keyPrefix, label: `${hub.code} sync key`, isActive: true });

    await logAudit({ userId: user.id, action: "register_hub", tableName: "facilities", recordId: hub.id, newValues: { code: hub.code, keyPrefix } });
    return NextResponse.json(
      { ...hub, apiKey: rawKey, apiKeyNote: "Save this API key now — it will not be shown again. Enter it in the Regional Hub's Sync page." },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error, "Failed to register hub");
  }
}
