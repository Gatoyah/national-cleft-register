import { NextRequest, NextResponse } from "next/server";
import { db, patients } from "@/db";
import { requirePermission, requireMutation } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { withNcrId } from "@/lib/ncr-id";
import { apiError } from "@/lib/api";
import { createPatientSchema } from "@/lib/schemas";
import { desc, like, or } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutation(request, "patients.create");
    if (user instanceof NextResponse) return user;

    const d = createPatientSchema.parse(sanitizeObject(await request.json()));
    const newPatient = await withNcrId(async (ncrId) => {
      const [row] = await db
        .insert(patients)
        .values({
          ncrId,
          firstName: d.firstName,
          middleName: d.middleName || null,
          lastName: d.lastName,
          dateOfBirth: d.dateOfBirth,
          sex: d.sex,
          placeOfBirth: d.placeOfBirth || null,
          ghanaCardNumber: d.ghanaCardNumber || null,
          nhisNumber: d.nhisNumber || null,
          regionOfResidence: d.regionOfResidence,
          districtOfResidence: d.districtOfResidence || null,
          townVillage: d.townVillage || null,
          gpsLatitude: d.gpsLatitude,
          gpsLongitude: d.gpsLongitude,
          caregiverName: d.caregiverName,
          caregiverRelationship: d.caregiverRelationship || null,
          caregiverPhone: d.caregiverPhone || null,
          caregiverPhone2: d.caregiverPhone2 || null,
          caregiverOccupation: d.caregiverOccupation || null,
          consentClinicalCare: !!d.consentClinicalCare,
          consentPhotography: !!d.consentPhotography,
          consentResearch: !!d.consentResearch,
          consentDataSharing: !!d.consentDataSharing,
          consentDate: d.consentDate || null,
          consentWitnessName: d.consentWitnessName || null,
          registeredByUserId: user.id,
          registeredAtFacilityId: user.facilityId,
          currentFacilityId: user.facilityId,
        })
        .returning();
      return row;
    });

    await logAudit({ userId: user.id, action: "create_patient", tableName: "patients", recordId: newPatient.id, newValues: { ncrId: newPatient.ncrId } });
    return NextResponse.json(newPatient, { status: 201 });
  } catch (error) {
    return apiError(error, "Failed to create patient");
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("patients.view");
    if (user instanceof NextResponse) return user;

    const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 100, 1), 500);
    const where = q
      ? or(like(patients.ncrId, `%${q}%`), like(patients.firstName, `%${q}%`), like(patients.lastName, `%${q}%`))
      : undefined;

    const list = await db.select().from(patients).where(where).orderBy(desc(patients.createdAt)).limit(limit);
    return NextResponse.json(list);
  } catch (error) {
    return apiError(error, "Failed to fetch patients");
  }
}
