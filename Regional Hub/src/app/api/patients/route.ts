import { NextRequest, NextResponse } from "next/server";
import { db, patients, diagnoses } from "@/db";
import { requirePermission, requireMutation } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError } from "@/lib/api";
import { createPatientSchema } from "@/lib/schemas";
import { enqueue, syncSoon } from "@/lib/sync";
import { desc, count, like, or } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutation(request, "patients.create");
    if (user instanceof NextResponse) return user;

    const d = createPatientSchema.parse(sanitizeObject(await request.json()));

    // Saved locally first — works with no internet. The sync queue carries it to the Main Hub later.
    const [newPatient] = await db
      .insert(patients)
      .values({
        firstName: d.firstName,
        middleName: d.middleName || null,
        lastName: d.lastName,
        dateOfBirth: d.dateOfBirth,
        sex: d.sex,
        placeOfBirth: d.placeOfBirth || null,
        regionOfResidence: d.regionOfResidence,
        districtOfResidence: d.districtOfResidence || null,
        townVillage: d.townVillage || null,
        gpsLatitude: d.gpsLatitude,
        gpsLongitude: d.gpsLongitude,
        caregiverName: d.caregiverName,
        caregiverRelationship: d.caregiverRelationship || null,
        caregiverPhone: d.caregiverPhone || null,
        caregiverPhone2: d.caregiverPhone2 || null,
        consentClinicalCare: !!d.consentClinicalCare,
        consentResearch: !!d.consentResearch,
        consentDataSharing: !!d.consentDataSharing,
        consentDate: d.consentClinicalCare || d.consentResearch || d.consentDataSharing ? new Date().toISOString().slice(0, 10) : null,
        registeredByUserId: user.id,
        syncStatus: "pending",
      })
      .returning();

    if (d.cleftType) {
      await db.insert(diagnoses).values({
        patientId: newPatient.id,
        diagnosisDate: new Date().toISOString().slice(0, 10),
        diagnosedAtBirth: true,
        cleftType: d.cleftType,
        lipInvolved: d.cleftType !== "cleft_palate_only",
        lipLaterality: d.lipLaterality || null,
        palateInvolved: d.cleftType !== "cleft_lip_only",
        diagnosedByUserId: user.id,
        syncStatus: "pending",
      });
    }

    await enqueue("patients", newPatient.localId);
    await logAudit({ userId: user.id, action: "create_patient", tableName: "patients", recordId: newPatient.id, newValues: { localId: newPatient.localId } });
    syncSoon();

    return NextResponse.json(newPatient, { status: 201 });
  } catch (error) {
    return apiError(error, "Failed to create patient");
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("patients.view");
    if (user instanceof NextResponse) return user;

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page")) || 1);
    const limit = Math.min(Math.max(Number(sp.get("limit")) || 50, 1), 100);
    const q = sp.get("q")?.trim().slice(0, 100);
    const where = q ? or(like(patients.firstName, `%${q}%`), like(patients.lastName, `%${q}%`), like(patients.ncrId, `%${q}%`)) : undefined;

    const [list, total] = await Promise.all([
      db.select().from(patients).where(where).orderBy(desc(patients.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: count() }).from(patients).where(where),
    ]);
    const n = total[0]?.count || 0;
    return NextResponse.json({ patients: list, pagination: { page, limit, total: n, totalPages: Math.ceil(n / limit) } });
  } catch (error) {
    return apiError(error, "Failed to fetch patients");
  }
}
