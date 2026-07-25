import { NextRequest, NextResponse } from "next/server";
import { db, patients } from "@/db";
import { validateApiKey } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

// Schema for incoming patient sync data from regional hubs
const syncPatientSchema = z.object({
  facilityCode: z.string().min(1),
  facilityApiKey: z.string().min(1),
  patients: z.array(z.object({
    localId: z.string(), // ID from regional hub
    ncrId: z.string().optional(),
    firstName: z.string(),
    lastName: z.string(),
    middleName: z.string().optional(),
    dateOfBirth: z.string(),
    sex: z.enum(["male", "female", "intersex"]),
    regionOfResidence: z.string(),
    districtOfResidence: z.string().optional(),
    townVillage: z.string().optional(),
    caregiverName: z.string(),
    caregiverPhone: z.string().optional(),
    caregiverRelationship: z.string().optional(),
    cleftType: z.string().optional(),
    createdAt: z.string(), // ISO timestamp from regional hub
  })),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = syncPatientSchema.parse(sanitizedBody);

    // Validate facility API key against database
    const keyResult = await validateApiKey(validatedData.facilityApiKey);
    if (!keyResult) {
      // Log the validation failure
      await logAudit({
        userId: null,
        action: "sync_patients_unauthorized",
        tableName: "patients",
        newValues: { facilityCode: validatedData.facilityCode },
      });

      return NextResponse.json(
        { error: "Unauthorized. Invalid facility API key." },
        { status: 401 }
      );
    }

    const results = {
      received: validatedData.patients.length,
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const patient of validatedData.patients) {
      try {
        // Generate NCR ID if not provided
        const ncrId = patient.ncrId || `NCR-${new Date().getFullYear()}-${Math.floor(Math.random() * 99999).toString().padStart(5, "0")}`;

        // Insert patient (in production, would check for duplicates first)
        await db.insert(patients).values({
          ncrId,
          firstName: patient.firstName,
          lastName: patient.lastName,
          middleName: patient.middleName || null,
          dateOfBirth: patient.dateOfBirth,
          sex: patient.sex,
          regionOfResidence: patient.regionOfResidence as typeof patients.regionOfResidence.enumValues[number],
          districtOfResidence: patient.districtOfResidence || null,
          townVillage: patient.townVillage || null,
          caregiverName: patient.caregiverName,
          caregiverPhone: patient.caregiverPhone || null,
          caregiverRelationship: patient.caregiverRelationship || null,
          createdAt: new Date(patient.createdAt),
        } as any);

        results.created++;

        // Log the sync action using logAudit
        await logAudit({
          userId: null,
          action: "sync_create_patient",
          tableName: "patients",
          newValues: { localId: patient.localId, ncrId, facilityId: keyResult.facilityId },
        });
      } catch (err) {
        results.errors.push(`Failed to sync patient ${patient.localId}: ${err instanceof Error ? err.message : "Unknown error"}`);
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
