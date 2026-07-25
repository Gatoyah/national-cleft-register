import { NextRequest, NextResponse } from "next/server";
import { db, patients } from "@/db";
import { generateNCRId } from "@/lib/utils";
import { requireRole, getSessionToken } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { validateCsrfToken } from "@/lib/csrf";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createPatientSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  sex: z.enum(["male", "female", "intersex"]),
  placeOfBirth: z.string().optional(),
  ghanaCardNumber: z.string().optional(),
  nhisNumber: z.string().optional(),
  regionOfResidence: z.enum([
    "ashanti", "greater_accra", "northern", "western", "eastern",
    "central", "volta", "upper_east", "upper_west", "bono",
    "bono_east", "ahafo", "western_north", "oti", "north_east", "savannah"
  ]),
  districtOfResidence: z.string().optional(),
  townVillage: z.string().optional(),
  gpsLatitude: z.string().optional().transform(v => v ? parseFloat(v) : undefined),
  gpsLongitude: z.string().optional().transform(v => v ? parseFloat(v) : undefined),
  caregiverName: z.string().min(1, "Caregiver name is required"),
  caregiverRelationship: z.string().optional(),
  caregiverPhone: z.string().optional(),
  caregiverPhone2: z.string().optional(),
  caregiverOccupation: z.string().optional(),
  consentClinicalCare: z.coerce.boolean().optional(),
  consentPhotography: z.coerce.boolean().optional(),
  consentResearch: z.coerce.boolean().optional(),
  consentDataSharing: z.coerce.boolean().optional(),
  consentDate: z.string().optional(),
  consentWitnessName: z.string().optional(),
});

export async function POST(request: NextRequest) {
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
    
    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = createPatientSchema.parse(sanitizedBody);

    const ncrId = generateNCRId();

    const [newPatient] = await db
      .insert(patients)
      .values({
        ncrId,
        firstName: validatedData.firstName,
        middleName: validatedData.middleName || null,
        lastName: validatedData.lastName,
        dateOfBirth: validatedData.dateOfBirth,
        sex: validatedData.sex,
        placeOfBirth: validatedData.placeOfBirth || null,
        ghanaCardNumber: validatedData.ghanaCardNumber || null,
        nhisNumber: validatedData.nhisNumber || null,
        regionOfResidence: validatedData.regionOfResidence,
        districtOfResidence: validatedData.districtOfResidence || null,
        townVillage: validatedData.townVillage || null,
        gpsLatitude: validatedData.gpsLatitude?.toString() || null,
        gpsLongitude: validatedData.gpsLongitude?.toString() || null,
        caregiverName: validatedData.caregiverName,
        caregiverRelationship: validatedData.caregiverRelationship || null,
        caregiverPhone: validatedData.caregiverPhone || null,
        caregiverPhone2: validatedData.caregiverPhone2 || null,
        caregiverOccupation: validatedData.caregiverOccupation || null,
        consentClinicalCare: validatedData.consentClinicalCare || false,
        consentPhotography: validatedData.consentPhotography || false,
        consentResearch: validatedData.consentResearch || false,
        consentDataSharing: validatedData.consentDataSharing || false,
        consentDate: validatedData.consentDate || null,
        consentWitnessName: validatedData.consentWitnessName || null,
        registeredByUserId: user.id,
      } as any)
      .returning();

    // Log action to audit log
    await logAudit({
      userId: user.id,
      action: "create_patient",
      tableName: "patients",
      recordId: newPatient.id,
      newValues: sanitizedBody,
    });

    return NextResponse.json(newPatient, { status: 201 });
  } catch (error) {
    console.error("Error creating patient:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create patient" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const user = await requireRole("admin", "clinician", "surgeon", "data_clerk", "community_health_worker");
    if (user instanceof NextResponse) return user;

    const patientList = await db
      .select()
      .from(patients)
      .orderBy(patients.createdAt)
      .limit(100);

    return NextResponse.json(patientList);
  } catch (error) {
    console.error("Error fetching patients:", error);
    return NextResponse.json(
      { error: "Failed to fetch patients" },
      { status: 500 }
    );
  }
}
