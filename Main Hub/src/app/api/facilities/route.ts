import { NextRequest, NextResponse } from "next/server";
import { db, facilities } from "@/db";
import { requireAuth, requireMutation } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError, REGIONS, optionalText } from "@/lib/api";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

// Any logged-in user may list facility names (needed for forms). No patient data here.
export async function GET() {
  try {
    const user = await requireAuth();
    if (user instanceof NextResponse) return user;
    const list = await db
      .select({ id: facilities.id, name: facilities.name, code: facilities.code, facilityType: facilities.facilityType, region: facilities.region })
      .from(facilities)
      .where(eq(facilities.isActive, true))
      .orderBy(asc(facilities.name));
    return NextResponse.json(list);
  } catch (error) {
    return apiError(error, "Failed to fetch facilities");
  }
}

const createFacilitySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  code: z.string().min(1, "Code is required").max(10).regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, - and _ only"),
  facilityType: z.enum(["hub", "co_hub", "regional_centre", "district_hospital", "chps_compound", "ngo", "mission_hospital"]),
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
    const d = createFacilitySchema.parse(sanitizeObject(await request.json()));
    const [row] = await db
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
    await logAudit({ userId: user.id, action: "create_facility", tableName: "facilities", recordId: row.id, newValues: { code: row.code } });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return apiError(error, "Failed to create facility");
  }
}
