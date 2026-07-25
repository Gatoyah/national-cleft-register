import { NextRequest, NextResponse } from "next/server";
import { db, diagnoses } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const createDiagnosisSchema = z.object({
  diagnosisDate: z.string().min(1, "Diagnosis date is required"),
  diagnosedAntenatally: z.coerce.boolean().optional(),
  diagnosedAtBirth: z.coerce.boolean().optional(),
  ageAtDiagnosisDays: z.coerce.number().optional(),
  cleftType: z.enum(["cleft_lip_only", "cleft_palate_only", "cleft_lip_and_palate"]),
  lipInvolved: z.coerce.boolean().optional(),
  lipLaterality: z.enum(["unilateral_left", "unilateral_right", "bilateral", "midline"]).optional(),
  lipComplete: z.coerce.boolean().optional(),
  alveolarInvolved: z.coerce.boolean().optional(),
  alveolarLaterality: z.enum(["unilateral_left", "unilateral_right", "bilateral", "midline"]).optional(),
  palateInvolved: z.coerce.boolean().optional(),
  palateType: z.enum(["soft", "hard", "soft_and_hard", "submucous"]).optional(),
  veauClass: z.enum(["I", "II", "III", "IV"]).optional(),
  lahsalCode: z.string().optional(),
  icd10Code: z.string().optional(),
  icd11Code: z.string().optional(),
  hasAssociatedAnomalies: z.coerce.boolean().optional(),
  pierreRobinSequence: z.coerce.boolean().optional(),
  deletion22q11: z.coerce.boolean().optional(),
  otherSyndrome: z.string().optional(),
  associatedAnomaliesDetails: z.string().optional(),
  isPrimaryDiagnosis: z.coerce.boolean().optional(),
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
    const validatedData = createDiagnosisSchema.parse(body);

    const [newDiagnosis] = await db
      .insert(diagnoses)
      .values({
        patientId,
        diagnosisDate: validatedData.diagnosisDate,
        diagnosedAntenatally: validatedData.diagnosedAntenatally || false,
        diagnosedAtBirth: validatedData.diagnosedAtBirth || false,
        ageAtDiagnosisDays: validatedData.ageAtDiagnosisDays || null,
        cleftType: validatedData.cleftType,
        lipInvolved: validatedData.lipInvolved || false,
        lipLaterality: validatedData.lipLaterality || null,
        lipComplete: validatedData.lipComplete || null,
        alveolarInvolved: validatedData.alveolarInvolved || false,
        alveolarLaterality: validatedData.alveolarLaterality || null,
        palateInvolved: validatedData.palateInvolved || false,
        palateType: validatedData.palateType || null,
        veauClass: validatedData.veauClass || null,
        lahsalCode: validatedData.lahsalCode || null,
        icd10Code: validatedData.icd10Code || null,
        icd11Code: validatedData.icd11Code || null,
        hasAssociatedAnomalies: validatedData.hasAssociatedAnomalies || false,
        pierreRobinSequence: validatedData.pierreRobinSequence || false,
        deletion22q11: validatedData.deletion22q11 || false,
        otherSyndrome: validatedData.otherSyndrome || null,
        associatedAnomaliesDetails: validatedData.associatedAnomaliesDetails || null,
        isPrimaryDiagnosis: validatedData.isPrimaryDiagnosis !== false,
        diagnosedByUserId: user?.id || null,
      })
      .returning();

    return NextResponse.json(newDiagnosis, { status: 201 });
  } catch (error) {
    console.error("Error creating diagnosis:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create diagnosis" },
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

    const diagnosisList = await db
      .select()
      .from(diagnoses)
      .where(eq(diagnoses.patientId, patientId));

    return NextResponse.json(diagnosisList);
  } catch (error) {
    console.error("Error fetching diagnoses:", error);
    return NextResponse.json(
      { error: "Failed to fetch diagnoses" },
      { status: 500 }
    );
  }
}
