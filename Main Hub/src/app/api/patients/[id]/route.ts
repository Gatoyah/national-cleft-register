import { NextRequest, NextResponse } from "next/server";
import { db, patients } from "@/db";
import { eq } from "drizzle-orm";
import { requireRole, getSessionToken } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { validateCsrfToken } from "@/lib/csrf";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireRole("admin", "clinician", "surgeon", "data_clerk", "community_health_worker");
    if (user instanceof NextResponse) return user;

    const { id } = await params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }

    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    return NextResponse.json(patient);
  } catch (error) {
    console.error("Error fetching patient:", error);
    return NextResponse.json(
      { error: "Failed to fetch patient" },
      { status: 500 }
    );
  }
}

const updatePatientSchema = z.object({
  firstName: z.string().min(1).optional(),
  middleName: z.string().optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.string().optional(),
  sex: z.enum(["male", "female", "intersex"]).optional(),
  placeOfBirth: z.string().optional(),
  ghanaCardNumber: z.string().optional(),
  nhisNumber: z.string().optional(),
  regionOfResidence: z.enum([
    "ashanti", "greater_accra", "northern", "western", "eastern",
    "central", "volta", "upper_east", "upper_west", "bono",
    "bono_east", "ahafo", "western_north", "oti", "north_east", "savannah"
  ]).optional(),
  districtOfResidence: z.string().optional(),
  townVillage: z.string().optional(),
  caregiverName: z.string().min(1).optional(),
  caregiverRelationship: z.string().optional(),
  caregiverPhone: z.string().optional(),
  caregiverPhone2: z.string().optional(),
  caregiverOccupation: z.string().optional(),
  isDeceased: z.boolean().optional(),
  deceasedDate: z.string().optional(),
  isLostToFollowUp: z.boolean().optional(),
  lostToFollowUpDate: z.string().optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireRole("admin", "clinician", "surgeon", "data_clerk");
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

    const { id } = await params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }

    // Get the existing patient record for audit logging (oldValues)
    const [existingPatient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);

    if (!existingPatient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = updatePatientSchema.parse(sanitizedBody);

    const [updatedPatient] = await db
      .update(patients)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(patients.id, patientId))
      .returning();

    // Log update action to audit log
    await logAudit({
      userId: user.id,
      action: "update_patient",
      tableName: "patients",
      recordId: patientId,
      oldValues: existingPatient,
      newValues: updatedPatient,
    });

    return NextResponse.json(updatedPatient);
  } catch (error) {
    console.error("Error updating patient:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update patient" },
      { status: 500 }
    );
  }
}
