import { NextRequest, NextResponse } from "next/server";
import { db, surgeries } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const createSurgerySchema = z.object({
  // Pre-operative
  preOpDate: z.string().optional(),
  preOpHaemoglobin: z.coerce.number().optional(),
  bloodGroup: z.string().optional(),
  asaClassification: z.enum(["I", "II", "III", "IV", "V", "VI"]).optional(),
  preOpWeight: z.coerce.number().optional(),
  anaesthesiaReviewCompleted: z.coerce.boolean().optional(),
  safetyChecklistCompleted: z.coerce.boolean().optional(),
  fitForSurgery: z.coerce.boolean().optional(),
  preOpNotes: z.string().optional(),
  // Surgery
  surgeryDate: z.string().min(1, "Surgery date is required"),
  surgeryType: z.enum([
    "primary_lip_repair", "primary_palate_repair", "secondary_lip_revision",
    "alveolar_bone_graft", "pharyngoplasty", "fistula_repair", "rhinoplasty", "other"
  ]),
  isPrimarySurgery: z.coerce.boolean().optional(),
  surgerySequenceNumber: z.coerce.number().optional(),
  procedureDescription: z.string().optional(),
  // Technique
  lipTechnique: z.enum(["millard", "tennison_randall", "fisher", "mohler", "other"]).optional(),
  palateTechnique: z.enum(["bardach", "furlow", "von_langenbeck", "veau_wardill_kilner", "intravelar_veloplasty", "other"]).optional(),
  otherTechniqueDetails: z.string().optional(),
  // Timing
  durationMinutes: z.coerce.number().optional(),
  anaesthesiaType: z.string().optional(),
  // Intraoperative
  bloodLossMl: z.coerce.number().optional(),
  bloodTransfusion: z.coerce.boolean().optional(),
  transfusionVolumeMl: z.coerce.number().optional(),
  intraopComplications: z.coerce.boolean().optional(),
  intraopComplicationsDetails: z.string().optional(),
  // Post-operative
  icuAdmission: z.coerce.boolean().optional(),
  icuDays: z.coerce.number().optional(),
  postOpNotes: z.string().optional(),
  // Discharge
  dischargeDate: z.string().optional(),
  lengthOfStayDays: z.coerce.number().optional(),
  dischargeCondition: z.string().optional(),
  dischargeInstructions: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const patientId = parseInt(id, 10);
    const user = await getCurrentUser();

    if (isNaN(patientId)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }

    const body = await request.json();
    const validatedData = createSurgerySchema.parse(body);

    const [newSurgery] = await db
      .insert(surgeries)
      .values({
        patientId,
        preOpDate: validatedData.preOpDate || null,
        preOpHaemoglobin: validatedData.preOpHaemoglobin?.toString() || null,
        bloodGroup: validatedData.bloodGroup || null,
        asaClassification: validatedData.asaClassification || null,
        preOpWeight: validatedData.preOpWeight?.toString() || null,
        anaesthesiaReviewCompleted: validatedData.anaesthesiaReviewCompleted || false,
        safetyChecklistCompleted: validatedData.safetyChecklistCompleted || false,
        fitForSurgery: validatedData.fitForSurgery || null,
        preOpNotes: validatedData.preOpNotes || null,
        surgeryDate: validatedData.surgeryDate,
        surgeryType: validatedData.surgeryType,
        isPrimarySurgery: validatedData.isPrimarySurgery !== false,
        surgerySequenceNumber: validatedData.surgerySequenceNumber || 1,
        procedureDescription: validatedData.procedureDescription || null,
        lipTechnique: validatedData.lipTechnique || null,
        palateTechnique: validatedData.palateTechnique || null,
        otherTechniqueDetails: validatedData.otherTechniqueDetails || null,
        durationMinutes: validatedData.durationMinutes || null,
        anaesthesiaType: validatedData.anaesthesiaType || null,
        bloodLossMl: validatedData.bloodLossMl || null,
        bloodTransfusion: validatedData.bloodTransfusion || false,
        transfusionVolumeMl: validatedData.transfusionVolumeMl || null,
        intraopComplications: validatedData.intraopComplications || false,
        intraopComplicationsDetails: validatedData.intraopComplicationsDetails || null,
        icuAdmission: validatedData.icuAdmission || false,
        icuDays: validatedData.icuDays || null,
        postOpNotes: validatedData.postOpNotes || null,
        dischargeDate: validatedData.dischargeDate || null,
        lengthOfStayDays: validatedData.lengthOfStayDays || null,
        dischargeCondition: validatedData.dischargeCondition || null,
        dischargeInstructions: validatedData.dischargeInstructions || null,
        primarySurgeonId: user?.id || null,
      } as any)
      .returning();

    return NextResponse.json(newSurgery, { status: 201 });
  } catch (error) {
    console.error("Error creating surgery:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create surgery" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }

    const surgeryList = await db
      .select()
      .from(surgeries)
      .where(eq(surgeries.patientId, patientId));

    return NextResponse.json(surgeryList);
  } catch (error) {
    console.error("Error fetching surgeries:", error);
    return NextResponse.json(
      { error: "Failed to fetch surgeries" },
      { status: 500 }
    );
  }
}
