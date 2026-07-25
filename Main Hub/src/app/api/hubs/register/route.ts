import { NextRequest, NextResponse } from "next/server";
import { db, facilities } from "@/db";
import { requireRole } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { z } from "zod";

const createHubSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required").max(10),
  facilityType: z.enum(["co_hub", "regional_centre"]),
  region: z.string().min(1, "Region is required"),
  district: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  hasInternet: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole("admin");
    if (user instanceof NextResponse) return user;

    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = createHubSchema.parse(sanitizedBody);

    const [newHub] = await db
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
        hasInternet: validatedData.hasInternet ?? false,
        isActive: true,
      })
      .returning();

    return NextResponse.json(newHub, { status: 201 });
  } catch (error) {
    console.error("Register hub error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes("unique")) {
      return NextResponse.json(
        { error: "A facility with this code already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to register hub" },
      { status: 500 }
    );
  }
}
