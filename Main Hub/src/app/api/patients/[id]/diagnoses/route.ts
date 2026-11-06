import { NextRequest, NextResponse } from "next/server";
import { db, diagnoses, patients } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireMutation } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError, parseId, isoDate, optionalText } from "@/lib/api";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const laterality = z.enum(["unilateral_left", "unilateral_right", "bilateral", "midline"]);
const optEnum = <T extends z.ZodTypeAny>(e: T) => z.union([e, z.literal("")]).optional().nullable().transform((v) => (v ? v : null));

const createDiagnosisSchema = z.object({
  diagnosisDate: isoDate,
  diagnosedAntenatally: z.coerce.boolean().optional(),
  diagnosedAtBirth: z.coerce.boolean().optional(),
  ageAtDiagnosisDays: z.coerce.number().int().min(0).max(36500).optional().nullable(),
  cleftType: z.enum(["cleft_lip_only", "cleft_palate_only", "cleft_lip_and_palate"]),
  lipInvolved: z.coerce.boolean().optional(),
  lipLaterality: optEnum(laterality),
  lipComplete: z.coerce.boolean().optional().nullable(),
  alveolarInvolved: z.coerce.boolean().optional(),
  alveolarLaterality: optEnum(laterality),
  palateInvolved: z.coerce.boolean().optional(),
  palateType: optEnum(z.enum(["soft", "hard", "soft_and_hard", "submucous"])),
  veauClass: optEnum(z.enum(["I", "II", "III", "IV"])),
  lahsalCode: optionalText(20),
  icd10Code: optionalText(10),
  icd11Code: optionalText(20),
  hasAssociatedAnomalies: z.coerce.boolean().optional(),
  pierreRobinSequence: z.coerce.boolean().optional(),
  deletion22q11: z.coerce.boolean().optional(),
  otherSyndrome: optionalText(),
  associatedAnomaliesDetails: optionalText(5000),
  isPrimaryDiagnosis: z.coerce.boolean().optional(),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireMutation(request, "clinical.edit");
    if (user instanceof NextResponse) return user;
    const patientId = parseId((await params).id);
    if (!patientId) return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });

    const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId)).limit(1);
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    const d = createDiagnosisSchema.parse(sanitizeObject(await request.json()));
    const [row] = await db
      .insert(diagnoses)
      .values({
        patientId,
        diagnosisDate: d.diagnosisDate,
        diagnosedAntenatally: !!d.diagnosedAntenatally,
        diagnosedAtBirth: !!d.diagnosedAtBirth,
        ageAtDiagnosisDays: d.ageAtDiagnosisDays ?? null,
        cleftType: d.cleftType,
        lipInvolved: d.lipInvolved ?? d.cleftType !== "cleft_palate_only",
        lipLaterality: d.lipLaterality,
        lipComplete: d.lipComplete ?? null,
        alveolarInvolved: !!d.alveolarInvolved,
        alveolarLaterality: d.alveolarLaterality,
        palateInvolved: d.palateInvolved ?? d.cleftType !== "cleft_lip_only",
        palateType: d.palateType,
        veauClass: d.veauClass,
        lahsalCode: d.lahsalCode || null,
        icd10Code: d.icd10Code || null,
        icd11Code: d.icd11Code || null,
        hasAssociatedAnomalies: !!d.hasAssociatedAnomalies,
        pierreRobinSequence: !!d.pierreRobinSequence,
        deletion22q11: !!d.deletion22q11,
        otherSyndrome: d.otherSyndrome || null,
        associatedAnomaliesDetails: d.associatedAnomaliesDetails || null,
        isPrimaryDiagnosis: d.isPrimaryDiagnosis !== false,
        diagnosedByUserId: user.id,
        diagnosedAtFacilityId: user.facilityId,
      })
      .returning();

    await logAudit({ userId: user.id, action: "create_diagnosis", tableName: "diagnoses", recordId: row.id, newValues: { patientId, cleftType: d.cleftType } });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return apiError(error, "Failed to create diagnosis");
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission("patients.view");
    if (user instanceof NextResponse) return user;
    const patientId = parseId((await params).id);
    if (!patientId) return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    return NextResponse.json(await db.select().from(diagnoses).where(eq(diagnoses.patientId, patientId)));
  } catch (error) {
    return apiError(error, "Failed to fetch diagnoses");
  }
}
