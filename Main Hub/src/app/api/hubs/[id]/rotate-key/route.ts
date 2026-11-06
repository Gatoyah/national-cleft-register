import { NextRequest, NextResponse } from "next/server";
import { db, facilities, apiKeys } from "@/db";
import { eq } from "drizzle-orm";
import { requireMutation, generateApiKey } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { apiError, parseId } from "@/lib/api";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Revoke all existing sync keys of a hub and issue a new one.
 * Use when a key may have leaked, or a Regional Hub machine was replaced.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireMutation(request, "hubs.manage");
    if (user instanceof NextResponse) return user;
    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ error: "Invalid hub ID" }, { status: 400 });

    const [hub] = await db.select().from(facilities).where(eq(facilities.id, id)).limit(1);
    if (!hub) return NextResponse.json({ error: "Hub not found" }, { status: 404 });

    await db.update(apiKeys).set({ isActive: false }).where(eq(apiKeys.facilityId, id));
    const { rawKey, keyHash, keyPrefix } = generateApiKey();
    await db.insert(apiKeys).values({ facilityId: id, keyHash, keyPrefix, label: `${hub.code} sync key (rotated)`, isActive: true });

    await logAudit({ userId: user.id, action: "rotate_hub_key", tableName: "api_keys", recordId: id, newValues: { code: hub.code, keyPrefix } });
    return NextResponse.json({ code: hub.code, apiKey: rawKey });
  } catch (error) {
    return apiError(error, "Failed to rotate key");
  }
}
