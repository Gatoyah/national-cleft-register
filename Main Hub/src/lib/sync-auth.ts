import { NextRequest, NextResponse } from "next/server";
import { db, facilities } from "@/db";
import { eq } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export type SyncFacility = typeof facilities.$inferSelect;

/**
 * Authenticate a Regional Hub calling a /api/sync/* endpoint.
 *
 * The key is sent as "Authorization: Bearer <key>" (older hubs sent it in the
 * JSON body as facilityApiKey — still accepted). The key identifies the
 * facility; a facilityCode, if supplied, must match it, so one hub can never
 * write data in another hub's name.
 */
export async function authenticateSync(
  request: NextRequest,
  body?: { facilityApiKey?: unknown; facilityCode?: unknown }
): Promise<SyncFacility | NextResponse> {
  const header = request.headers.get("authorization");
  const rawKey = header?.startsWith("Bearer ")
    ? header.slice(7).trim()
    : typeof body?.facilityApiKey === "string"
      ? body.facilityApiKey
      : "";

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";
  const failLimit = rateLimit(`sync:fail:${ip}`, 20, 15 * 60 * 1000);

  const key = rawKey ? await validateApiKey(rawKey) : null;
  if (!key) {
    if (!failLimit.allowed) return NextResponse.json({ error: "Too many failed attempts" }, { status: 429 });
    await logAudit({ userId: null, action: "sync_unauthorized", tableName: "api_keys", newValues: { ip, path: request.nextUrl.pathname } });
    return NextResponse.json({ error: "Unauthorized. Invalid or revoked facility API key." }, { status: 401 });
  }

  const limit = rateLimit(`sync:key:${key.keyId}`, 120, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Sync rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } });
  }

  const [facility] = await db.select().from(facilities).where(eq(facilities.id, key.facilityId)).limit(1);
  if (!facility || !facility.isActive) {
    return NextResponse.json({ error: "Facility for this key is not active" }, { status: 403 });
  }

  if (typeof body?.facilityCode === "string" && body.facilityCode.toUpperCase() !== facility.code.toUpperCase()) {
    await logAudit({ userId: null, action: "sync_facility_mismatch", tableName: "facilities", recordId: facility.id, newValues: { claimed: body.facilityCode } });
    return NextResponse.json({ error: `Facility code does not match this API key (key belongs to ${facility.code}).` }, { status: 403 });
  }

  return facility;
}

export const MAX_BATCH = 200;
