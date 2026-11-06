import { NextRequest, NextResponse } from "next/server";
import { db, surgeries, patients } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireMutation } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError, parseId, isoDate, optionalIsoDate, optionalText } from "@/lib/api";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const num = (min: number, max: number) =>
  z.union([z.coerce.number().min(min).max(max), z.literal("")]).optional().nullable().transform((v) => (v === "" || v === undefined ? null : v));
const optEnum = <T extends z.ZodTypeAny>(e: T) => z.union([e, z.literal("")]).optional().nullable().transform((v) => (v ? v : null));

const createSurgerySchema = z.object({
  preOpDate: optionalIsoDate,
  preOpHaemoglobin: num(0, 30),
  bloodGroup: optionalText(5),
  asaClassification: optEnum(z.enum(["I", "II", "III", "IV", "V", "VI"])),
  preOpWeight: num(0, 300),
  anaesthesiaReviewCompleted: z.coerce.boolean().optional(),
  safetyChecklistCompleted: z.coerce.boolean().optional(),
  fitForSurgery: z.coerce.boolean().optional().nullable(),
  preOpNotes: optionalText(5000),
  surgeryDate: isoDate,
  surgeryType: z.enum([
    "primary_lip_repair", "primary_palate_repair", "secondary_lip_revision",
    "alveolar_bone_graft", "pharyngoplasty", "fistula_repair", "rhinoplasty", "other",
  ]),
  isPrimarySurgery: z.coerce.boolean().optional(),
  surgerySequenceNumber: num(1, 50),
  procedureDescription: optionalText(5000),
  lipTechnique: optEnum(z.enum(["millard", "tennison_randall", "fisher", "mohler", "other"])),
  palateTechnique: optEnum(z.enum(["bardach", "furlow", "von_langenbeck", "veau_wardill_kilner", "intravelar_veloplasty", "other"])),
  otherTechniqueDetails: optionalText(2000),
  durationMinutes: num(0, 2000),
  anaesthesiaType: optionalText(100),
  bloodLossMl: num(0, 20000),
  bloodTransfusion: z.coerce.boolean().optional(),
  transfusionVolumeMl: num(0, 20000),
  intraopComplications: z.coerce.boolean().optional(),
  intraopComplicationsDetails: optionalText(5000),
  icuAdmission: z.coerce.boolean().optional(),
  icuDays: num(0, 365),
  postOpNotes: optionalText(5000),
  dischargeDate: optionalIsoDate,
  lengthOfStayDays: num(0, 365),
  dischargeCondition: optionalText(50),
  dischargeInstructions: optionalText(5000),
  surgeonName: optionalText(),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireMutation(request, "surgeries.create");
    if (user instanceof NextResponse) return user;
    const patientId = parseId((await params).id);
    if (!patientId) return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });

    const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId)).limit(1);
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    const d = createSurgerySchema.parse(sanitizeObject(await request.json()));
    const [row] = await db
      .insert(surgeries)
      .values({
        patientId,
        preOpDate: d.preOpDate || null,
        preOpHaemoglobin: d.preOpHaemoglobin,
        bloodGroup: d.bloodGroup || null,
        asaClassification: d.asaClassification,
        preOpWeight: d.preOpWeight,
        anaesthesiaReviewCompleted: !!d.anaesthesiaReviewCompleted,
        safetyChecklistCompleted: !!d.safetyChecklistCompleted,
        fitForSurgery: d.fitForSurgery ?? null,
        preOpNotes: d.preOpNotes || null,
        surgeryDate: d.surgeryDate,
        surgeryType: d.surgeryType,
        isPrimarySurgery: d.isPrimarySurgery !== false,
        surgerySequenceNumber: d.surgerySequenceNumber ?? 1,
        procedureDescription: d.procedureDescription || null,
        lipTechnique: d.lipTechnique,
        palateTechnique: d.palateTechnique,
        otherTechniqueDetails: d.otherTechniqueDetails || null,
        durationMinutes: d.durationMinutes,
        anaesthesiaType: d.anaesthesiaType || null,
        bloodLossMl: d.bloodLossMl,
        bloodTransfusion: !!d.bloodTransfusion,
        transfusionVolumeMl: d.transfusionVolumeMl,
        intraopComplications: !!d.intraopComplications,
        intraopComplicationsDetails: d.intraopComplicationsDetails || null,
        icuAdmission: !!d.icuAdmission,
        icuDays: d.icuDays,
        postOpNotes: d.postOpNotes || null,
        dischargeDate: d.dischargeDate || null,
        lengthOfStayDays: d.lengthOfStayDays,
        dischargeCondition: d.dischargeCondition || null,
        dischargeInstructions: d.dischargeInstructions || null,
        surgeonName: d.surgeonName || `${user.firstName} ${user.lastName}`,
        primarySurgeonId: user.id,
        facilityId: user.facilityId,
      })
      .returning();

    await logAudit({ userId: user.id, action: "create_surgery", tableName: "surgeries", recordId: row.id, newValues: { patientId, surgeryType: d.surgeryType } });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return apiError(error, "Failed to create surgery");
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission("surgeries.view");
    if (user instanceof NextResponse) return user;
    const patientId = parseId((await params).id);
    if (!patientId) return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    return NextResponse.json(await db.select().from(surgeries).where(eq(surgeries.patientId, patientId)));
  } catch (error) {
    return apiError(error, "Failed to fetch surgeries");
  }
}
