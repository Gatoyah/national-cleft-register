import { NextRequest, NextResponse } from "next/server";
import { db, facilities } from "@/db";
import { requireAuth, requireRole, getSessionToken } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { validateCsrfToken } from "@/lib/csrf";
import { logAudit } from "@/lib/audit";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

export async function GET() {
  try {
    const user = await requireAuth();
    if (user instanceof NextResponse) return user;

    const facilityList = await db
      .select()
      .from(facilities)
      .where(eq(facilities.isActive, true))
      .orderBy(desc(facilities.createdAt));

    return NextResponse.json(facilityList);
  } catch (error) {
    console.error("Error fetching facilities:", error);
    return NextResponse.json(
      { error: "Failed to fetch facilities" },
      { status: 500 }
    );
  }
}

const createFacilitySchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required").max(10),
  facilityType: z.enum(["hub", "co_hub", "regional_centre", "district_hospital", "chps_compound", "ngo", "mission_hospital"]),
  region: z.string().min(1, "Region is required"),
  district: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  hasInternet: z.coerce.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole("admin");
    if (user instanceof NextResponse) return user;

    // Validate CSRF token
    const csrfToken = request.headers.get("x-csrf-token");
    const sessionToken = await getSessionToken();
    if (!csrfToken || !sessionToken || !validateCsrfToken(csrfToken, sessionToken)) {
      return NextResponse.json(
        { error: "Invalid or missing CSRF token" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = createFacilitySchema.parse(sanitizedBody);

    const [newFacility] = await db
      .insert(facilities)
      .values({
        name: validatedData.name,
        code: validatedData.code.toUpperCase(),
        facilityType: validatedData.facilityType,
        region: validatedData.region as typeof facilities.region.enumValues[number],
        district: validatedData.district || null,
        address: validatedData.address || null,
        phone: validatedData.phone || null,
        email: validatedData.email || null,
        hasInternet: validatedData.hasInternet || false,
        isActive: true,
      })
      .returning();

    // Log action to audit log
    await logAudit({
      userId: user.id,
      action: "create_facility",
      tableName: "facilities",
      recordId: newFacility.id,
      newValues: sanitizedBody,
    });

    return NextResponse.json(newFacility, { status: 201 });
  } catch (error) {
    console.error("Error creating facility:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create facility" },
      { status: 500 }
    );
  }
}
