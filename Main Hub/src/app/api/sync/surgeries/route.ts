import { NextRequest, NextResponse } from "next/server";
import { db, surgeries } from "@/db";
import { validateApiKey } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

// Schema for incoming surgery sync data from regional hubs
const syncSurgerySchema = z.object({
  facilityCode: z.string().min(1),
  facilityApiKey: z.string().min(1),
  surgeries: z.array(z.object({
    localId: z.string(),
    patientNcrId: z.string().nullable().optional(),
    patientLocalId: z.string().nullable().optional(),
    surgeryDate: z.string(),
    surgeryType: z.string(),
    isPrimarySurgery: z.boolean().nullable().optional(),
    lipTechnique: z.string().nullable().optional(),
    palateTechnique: z.string().nullable().optional(),
    surgeonName: z.string().nullable().optional(),
    durationMinutes: z.number().nullable().optional(),
    complications: z.boolean().nullable().optional(),
    complicationsDetails: z.string().nullable().optional(),
    dischargeDate: z.string().nullable().optional(),
    dischargeCondition: z.string().nullable().optional(),
    createdAt: z.string(),
  })),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = syncSurgerySchema.parse(sanitizedBody);

    // Validate facility API key against database
    const keyResult = await validateApiKey(validatedData.facilityApiKey);
    if (!keyResult) {
      // Log the validation failure
      await logAudit({
        userId: null,
        action: "sync_surgeries_unauthorized",
        tableName: "surgeries",
        newValues: { facilityCode: validatedData.facilityCode },
      });

      return NextResponse.json(
        { error: "Unauthorized. Invalid facility API key." },
        { status: 401 }
      );
    }

    const results = {
      received: validatedData.surgeries.length,
      created: 0,
      errors: [] as string[],
    };

    for (const surgery of validatedData.surgeries) {
      try {
        // In production, look up patient ID by NCR ID
        // For now, just store the surgery
        await db.insert(surgeries).values({
          patientId: 1, // Would be looked up
          surgeryDate: surgery.surgeryDate,
          surgeryType: surgery.surgeryType as typeof surgeries.surgeryType.enumValues[number],
          isPrimarySurgery: surgery.isPrimarySurgery ?? true,
          lipTechnique: surgery.lipTechnique as typeof surgeries.lipTechnique.enumValues[number] | null,
          palateTechnique: surgery.palateTechnique as typeof surgeries.palateTechnique.enumValues[number] | null,
          durationMinutes: surgery.durationMinutes || null,
          intraopComplications: surgery.complications || false,
          intraopComplicationsDetails: surgery.complicationsDetails || null,
          dischargeDate: surgery.dischargeDate || null,
          dischargeCondition: surgery.dischargeCondition || null,
        } as any);

        results.created++;

        // Log the sync action using logAudit
        await logAudit({
          userId: null,
          action: "sync_create_surgery",
          tableName: "surgeries",
          newValues: {
            localId: surgery.localId,
            patientNcrId: surgery.patientNcrId || null,
            patientLocalId: surgery.patientLocalId || null,
            facilityId: keyResult.facilityId
          },
        });
      } catch (err) {
        results.errors.push(`Failed to sync surgery ${surgery.localId}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("Sync error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid sync data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}
